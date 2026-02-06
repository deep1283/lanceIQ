'use server';

import { createClient } from "@/utils/supabase/server";

type PlanTier = 'free' | 'pro' | 'team';

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
  const supabase = await createClient();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { isPro: false, plan: 'free' as PlanTier };

  let workspaceIds: string[] = [];

  if (workspaceId) {
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (membershipError) {
      return { isPro: false, plan: 'free' as PlanTier };
    }

    if (membership?.workspace_id) {
      workspaceIds = [membership.workspace_id];
    } else {
      return { isPro: false, plan: 'free' as PlanTier };
    }
  } else {
    const { data: memberships, error: membershipsError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id);

    if (membershipsError || !memberships || memberships.length === 0) {
      return { isPro: false, plan: 'free' as PlanTier };
    }

    workspaceIds = memberships.map((m) => m.workspace_id);
  }

  const { data: workspaces, error: workspacesError } = await supabase
    .from('workspaces')
    .select('plan, subscription_status, subscription_current_period_end')
    .in('id', workspaceIds);

  if (workspacesError || !workspaces || workspaces.length === 0) {
    return { isPro: false, plan: 'free' as PlanTier };
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

  return { isPro, plan: isPro ? bestPlan : 'free' };
}
