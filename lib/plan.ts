export type PlanTier = 'free' | 'pro' | 'team';

export const PLAN_LIMITS = {
  free: {
    monthlyCertificates: 100,
    retentionDays: 7,
    canVerify: false,
    canExport: false,
    canAlerts: false,
    canAudit: false,
    canShare: false,
  },
  pro: {
    monthlyCertificates: 2000,
    retentionDays: 365,
    canVerify: true,
    canExport: true,
    canAlerts: false,
    canAudit: false,
    canShare: false,
  },
  team: {
    monthlyCertificates: 10000,
    retentionDays: 1095,
    canVerify: true,
    canExport: true,
    canAlerts: true,
    canAudit: true,
    canShare: true,
  },
} as const;

export function getPlanLimits(plan: PlanTier) {
  return PLAN_LIMITS[plan];
}

export function getRetentionExpiry(plan: PlanTier, fromDate = new Date()): Date {
  const expiry = new Date(fromDate);
  if (plan === 'free') {
    expiry.setDate(expiry.getDate() + 7);
  } else if (plan === 'pro') {
    expiry.setFullYear(expiry.getFullYear() + 1);
  } else {
    expiry.setFullYear(expiry.getFullYear() + 3);
  }
  return expiry;
}

export function isPaidPlan(plan: PlanTier) {
  return plan !== 'free';
}
