'use server';

import { createClient } from '@/utils/supabase/server';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';
import { revalidatePath } from 'next/cache';
import { canManageWorkspace } from '@/lib/roles';

interface AlertSettingsUpdate {
  workspace_id: string;
  channel: 'email' | 'slack' | 'webhook'; // Updated type
  destination: string;
  enabled: boolean;
  window_minutes: number;
  critical_fail_count: number;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function updateAlertSettings(data: AlertSettingsUpdate) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const workspaceId = data.workspace_id;

  // 1. Check Permissions (Owner or Admin)
  const { data: membership, error: memError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (memError || !membership || !canManageWorkspace(membership.role)) {
    return { error: 'You do not have permission to manage alerts for this workspace.' };
  }

  // 1.5 Check plan access (server-side gating)
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('plan, subscription_status, subscription_current_period_end')
    .eq('id', workspaceId)
    .single();

  if (workspaceError || !workspace) {
    return { error: 'Workspace not found.' };
  }

  const isTeam = workspace.plan === 'team';
  const status = workspace.subscription_status;
  const isActive = status === 'active' || status === 'past_due';
  const isCanceledButActive =
    status === 'canceled' &&
    typeof workspace.subscription_current_period_end === 'string' &&
    new Date(workspace.subscription_current_period_end).getTime() > Date.now();
  const canUseAlerts = isTeam && (isActive || isCanceledButActive);
  if (!canUseAlerts) {
    return { error: 'Upgrade to Team to enable alert settings.' };
  }

  // 1.6 Validate inputs
  const windowMinutes = Number(data.window_minutes);
  const criticalFailCount = Number(data.critical_fail_count);

  if (!Number.isFinite(windowMinutes) || windowMinutes < 1 || windowMinutes > 60) {
    return { error: 'Invalid time window. Choose between 1 and 60 minutes.' };
  }
  if (!Number.isFinite(criticalFailCount) || criticalFailCount < 1 || criticalFailCount > 100) {
    return { error: 'Invalid failure threshold. Choose between 1 and 100.' };
  }
  if (data.enabled) {
    if (!data.destination || data.destination.trim().length === 0) {
      return { error: 'Destination is required when alerts are enabled.' };
    }
    if (data.channel === 'email' && !isValidEmail(data.destination)) {
      return { error: 'Please enter a valid email address.' };
    }
    if ((data.channel === 'slack' || data.channel === 'webhook') && !isValidHttpsUrl(data.destination)) {
      return { error: 'Please enter a valid HTTPS URL.' };
    }
  }

  // 2. Upsert Settings
  const { data: existing } = await supabase
    .from('workspace_alert_settings')
    .select('id, cooldown_minutes, created_by')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const cooldownMinutes = existing?.cooldown_minutes ?? 30;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('workspace_alert_settings')
      .update({
        channel: data.channel,
        destination: data.destination,
        enabled: data.enabled,
        window_minutes: windowMinutes,
        critical_fail_count: criticalFailCount,
        cooldown_minutes: cooldownMinutes,
        updated_by: user.id
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Update settings failed:', updateError);
      return { error: 'Failed to save settings.' };
    }
  } else {
    const { error: insertError } = await supabase
      .from('workspace_alert_settings')
      .insert({
        workspace_id: workspaceId,
        channel: data.channel,
        destination: data.destination,
        enabled: data.enabled,
        window_minutes: windowMinutes,
        critical_fail_count: criticalFailCount,
        cooldown_minutes: cooldownMinutes,
        created_by: user.id
      });

    if (insertError) {
      console.error('Create settings failed:', insertError);
      return { error: 'Failed to save settings.' };
    }
  }

  // 3. Log Audit Action
  await logAuditAction({
    workspaceId: workspaceId,
    action: AUDIT_ACTIONS.ALERT_UPDATED,
    actorId: user.id,
    targetResource: 'workspace_alert_settings',
    details: {
      channel: data.channel,
      enabled: data.enabled,
      destination: data.destination
    }
  });

  revalidatePath(`/dashboard/${workspaceId}/settings`);
  revalidatePath(`/dashboard/settings`); // If the user is on the unified settings page

  return { success: true };
}
