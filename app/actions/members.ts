'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { canInviteMembers, isOwner } from "@/lib/roles";
import { logAuditAction, AUDIT_ACTIONS } from "@/utils/audit";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function inviteMember(email: string, workspaceId: string) {
  const supabase = await createClient();

  // 1. Verify Authentication & Ownership
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return { error: "Please provide a valid email address." };
  }
  if (user.email && normalizedEmail === user.email.toLowerCase()) {
    return { error: "You are already a member of this workspace." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (membershipError || !membership || !canInviteMembers(membership.role)) {
    return { error: "You do not have permission to invite members." };
  }

  // 2. Verify Plan (Team Only)
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single();

  if (!workspace || workspace.plan !== 'team') {
    return { error: "Inviting members is only available on the Team plan." };
  }
  
  // 3. Lookup User by Email using RPC
  const { data: targetUserId, error: lookupError } = await supabase
    .rpc('get_user_id_by_email', { email: normalizedEmail, lookup_workspace_id: workspaceId });

  if (lookupError || !targetUserId) {
    // If user not found, we currently BLOCK (MVP).
    return { error: "User not found. They must sign up for LanceIQ first." };
  }

  // 4. Add to Workspace
  const { error: insertError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      user_id: targetUserId,
      role: 'member'
    });

  if (insertError) {
    if (insertError.code === '23505') { // Unique violation
        return { error: "User is already a member of this workspace." };
    }
    console.error("Invite Error:", insertError);
    return { error: "Failed to add member." };
  }

  await logAuditAction({
    workspaceId: workspaceId,
    action: AUDIT_ACTIONS.MEMBER_INVITED,
    actorId: user.id,
    targetResource: 'workspace_members',
    details: {
      invited_user_id: targetUserId,
      invited_email: normalizedEmail,
    },
  });

  revalidatePath('/dashboard/settings');
  return { success: true };
}

export async function removeMember(userId: string, workspaceId: string) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check permissions (Owner only for removing)
  const { data: requester } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!requester || !isOwner(requester.role)) {
     return { error: "Only owners can remove members." };
  }

  // Prevent self-removal logic if needed (db constraint usually handles last owner)
  if (userId === user.id) {
    return { error: "You cannot remove yourself. Transfer ownership first." };
  }

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);

  if (error) {
    return { error: error.message };
  }

  await logAuditAction({
    workspaceId: workspaceId,
    action: AUDIT_ACTIONS.MEMBER_REMOVED,
    actorId: user.id,
    targetResource: 'workspace_members',
    details: {
      removed_user_id: userId,
    },
  });

  revalidatePath('/dashboard/settings');
  return { success: true };
}
