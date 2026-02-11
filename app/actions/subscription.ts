'use server';

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { type PlanTier, type PlanEntitlements, getPlanEntitlements } from "@/lib/plan";

const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function isPaidPlan(plan: string | null | undefined): plan is 'pro' | 'team' {
  return plan === 'pro' || plan === 'team';
}

function isWorkspacePro(workspace: { plan?: string | null; subscription_status?: string | null; subscription_current_period_end?: string | null }) {
  if (!isPaidPlan(workspace.plan)) return false;

  const status = workspace.subscription_status ?? 'free';
  const now = Date.now();
  const periodEnd = workspace.subscription_current_period_end
    ? new Date(workspace.subscription_current_period_end).getTime()
    : null;
  const withinGrace = periodEnd ? periodEnd + GRACE_PERIOD_MS > now : false;

  if (status === 'active') return true;
  if (status === 'past_due' || status === 'canceled') return withinGrace;
  return false;
}

export async function checkProStatus(workspaceId?: string) {
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
  let isPro = false;

  for (const workspace of workspaces) {
    if (isWorkspacePro(workspace)) {
      isPro = true;
      if (workspace.plan === 'team') {
        bestPlan = 'team';
      } else if (bestPlan !== 'team') {
        bestPlan = 'pro';
      }
    }
  }

  const effectivePlan: PlanTier = isPro ? bestPlan : 'free';
  const entitlements = getPlanEntitlements(effectivePlan);

  return {
    isPro,
    ...entitlements,
  };
}
