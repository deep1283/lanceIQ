export type PlanTier = 'free' | 'pro' | 'team';

export const PLAN_LIMITS = {
  free: {
    monthlyCertificates: 100,
    monthlyIngestEvents: 100,
    retentionDays: 7,
    canVerify: false,
    canExport: false,
    canAlerts: false,
    canAudit: false,
    canShare: false,
  },
  pro: {
    monthlyCertificates: 2000,
    monthlyIngestEvents: 2000,
    retentionDays: 365,
    canVerify: true,
    canExport: true,
    canAlerts: false,
    canAudit: false,
    canShare: false,
  },
  team: {
    monthlyCertificates: 10000,
    monthlyIngestEvents: 10000,
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

export type PlanEntitlements = {
  plan: PlanTier;
  isPaid: boolean;
  isTeam: boolean;
  canExportPdf: boolean;
  canExportCsv: boolean;
  canRemoveWatermark: boolean;
  canUseSso: boolean;
  canUseScim: boolean;
  canUseAccessReviews: boolean;
  canUseSlaIncidents: boolean;
  canUseLegalHold: boolean;
  canRotateKeys: boolean;
  canViewAuditLogs: boolean;
};

export function getPlanEntitlements(plan: PlanTier): PlanEntitlements {
  const isPaid = plan !== 'free';
  const isTeam = plan === 'team';

  return {
    plan,
    isPaid,
    isTeam,
    canExportPdf: true,
    canExportCsv: isPaid,
    canRemoveWatermark: isPaid,
    canUseSso: isTeam,
    canUseScim: isTeam,
    canUseAccessReviews: isTeam,
    canUseSlaIncidents: isTeam,
    canUseLegalHold: isTeam,
    canRotateKeys: isTeam,
    canViewAuditLogs: isTeam,
  };
}
