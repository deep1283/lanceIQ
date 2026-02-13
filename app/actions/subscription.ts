'use server';

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { type PlanTier, getPlanEntitlements } from "@/lib/plan";
import { getEffectivePlanFromWorkspace } from "@/lib/entitlements";

export async function checkPlanEntitlements(workspaceId?: string) {
  const freeEntitlements = getPlanEntitlements('free');
  const supabase = await createClient();
  
  // 1. Get User (Auth Context)
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    // console.log('[checkProStatus] No user found via getUser');
    return { isPro: false, ...freeEntitlements };
  }

  let workspaceIds: string[] = [];

  if (workspaceId) {
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (membershipError) {
      // console.log('[checkProStatus] Membership error details:', membershipError);
      return { isPro: false, ...freeEntitlements };
    }

    if (membership?.workspace_id) {
      workspaceIds = [membership.workspace_id];
    } else {
      // console.log('[checkProStatus] No membership for specific workspace');
      return { isPro: false, ...freeEntitlements };
    }
  } else {
    const { data: memberships, error: membershipsError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id);

    if (membershipsError || !memberships || memberships.length === 0) {
      // console.log('[checkProStatus] No memberships found for user');
      return { isPro: false, ...freeEntitlements };
    }

    workspaceIds = memberships.map((m) => m.workspace_id);
  }

  // 2. Fetch Workspace Details (Admin / Service Role to bypass RLS issues)
  // We verified membership above, so this is safe.
  const adminClient = createAdminClient();
  let workspaces:
    | { id?: string | null; name?: string | null; plan?: string | null; subscription_status?: string | null; subscription_current_period_end?: string | null }[]
    | null = null;
  let workspacesError: { code?: string } | null = null;

  {
    const { data, error } = await adminClient
      .from('workspaces')
      .select('id, name, plan, subscription_status, subscription_current_period_end')
      .in('id', workspaceIds);
    workspaces = data;
    workspacesError = (error as { code?: string } | null) ?? null;
  }

  // Backward-compatible fallback if subscription_current_period_end doesn't exist.
  if (workspacesError?.code === '42703') {
    const { data, error } = await adminClient
      .from('workspaces')
      .select('id, name, plan, subscription_status')
      .in('id', workspaceIds);
    workspaces = data as typeof workspaces;
    workspacesError = (error as { code?: string } | null) ?? null;
  }

  if (workspacesError || !workspaces || workspaces.length === 0) {
    console.error('[checkProStatus] Failed to fetch workspaces (admin):', workspacesError);
    return { isPro: false, ...freeEntitlements };
  }

  let bestPlan: PlanTier = 'free';

  for (const workspace of workspaces) {
    const effectivePlan = getEffectivePlanFromWorkspace(workspace);
    if (effectivePlan === 'team') {
      bestPlan = 'team';
    } else if (effectivePlan === 'pro' && bestPlan !== 'team') {
      bestPlan = 'pro';
    }
  }

  const entitlements = getPlanEntitlements(bestPlan);

  return {
    isPro: bestPlan !== 'free',
    ...entitlements,
  };
}

// Backward-compatible alias; prefer `checkPlanEntitlements`.
export async function checkProStatus(workspaceId?: string) {
  return checkPlanEntitlements(workspaceId);
}
