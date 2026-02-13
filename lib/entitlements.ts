import { getPlanEntitlements, type PlanTier } from '@/lib/plan';

const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export type WorkspaceBillingSnapshot = {
  plan?: string | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
};

function isPaidPlan(plan: string | null | undefined): plan is 'pro' | 'team' {
  return plan === 'pro' || plan === 'team';
}

function isWithinGrace(periodEnd: string | null | undefined): boolean {
  if (!periodEnd) return false;
  const periodEndMs = new Date(periodEnd).getTime();
  if (!Number.isFinite(periodEndMs)) return false;
  return periodEndMs + GRACE_PERIOD_MS > Date.now();
}

export function getEffectivePlanFromWorkspace(workspace: WorkspaceBillingSnapshot): PlanTier {
  if (!isPaidPlan(workspace.plan)) return 'free';

  const status = workspace.subscription_status ?? 'free';
  if (status === 'active') return workspace.plan;

  if (status === 'past_due' || status === 'canceled') {
    return isWithinGrace(workspace.subscription_current_period_end) ? workspace.plan : 'free';
  }

  return 'free';
}

export function getEffectiveEntitlementsForWorkspace(workspace: WorkspaceBillingSnapshot) {
  const plan = getEffectivePlanFromWorkspace(workspace);
  return {
    isPro: plan !== 'free',
    ...getPlanEntitlements(plan),
  };
}
