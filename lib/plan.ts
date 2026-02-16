export type PlanTier = 'free' | 'pro' | 'team';

const PLAN_ENTITLEMENTS = {
  free: {
    canExportPdf: true,
    canExportCsv: false,
    canVerify: false,
    canRemoveWatermark: false,
    canUseForwarding: false,
    canUseReconciliation: false,
    canUseAlerts: false,
    canUseSso: false,
    canUseScim: false,
    canUseAccessReviews: false,
    canUseSlaIncidents: false,
    canUseLegalHold: false,
    canRotateKeys: false,
    canViewAuditLogs: false,
  },
  pro: {
    canExportPdf: true,
    canExportCsv: true,
    canVerify: true,
    canRemoveWatermark: true,
    canUseForwarding: true,
    canUseReconciliation: false,
    canUseAlerts: false,
    canUseSso: false,
    canUseScim: false,
    canUseAccessReviews: false,
    canUseSlaIncidents: false,
    canUseLegalHold: false,
    canRotateKeys: false,
    canViewAuditLogs: false,
  },
  team: {
    canExportPdf: true,
    canExportCsv: true,
    canVerify: true,
    canRemoveWatermark: true,
    canUseForwarding: true,
    canUseReconciliation: true,
    canUseAlerts: true,
    canUseSso: true,
    canUseScim: true,
    canUseAccessReviews: true,
    canUseSlaIncidents: true,
    canUseLegalHold: true,
    canRotateKeys: true,
    canViewAuditLogs: true,
  },
} as const satisfies Record<PlanTier, {
  canExportPdf: boolean;
  canExportCsv: boolean;
  canVerify: boolean;
  canRemoveWatermark: boolean;
  canUseForwarding: boolean;
  canUseReconciliation: boolean;
  canUseAlerts: boolean;
  canUseSso: boolean;
  canUseScim: boolean;
  canUseAccessReviews: boolean;
  canUseSlaIncidents: boolean;
  canUseLegalHold: boolean;
  canRotateKeys: boolean;
  canViewAuditLogs: boolean;
}>;

export const PLAN_LIMITS = {
  free: {
    monthlyCertificates: 100,
    monthlyIngestEvents: 100,
    retentionDays: 7,
    canVerify: PLAN_ENTITLEMENTS.free.canVerify,
    canExport: PLAN_ENTITLEMENTS.free.canExportCsv,
    canAlerts: PLAN_ENTITLEMENTS.free.canUseAlerts,
    canAudit: PLAN_ENTITLEMENTS.free.canViewAuditLogs,
    canShare: false,
  },
  pro: {
    monthlyCertificates: 2000,
    monthlyIngestEvents: 2000,
    retentionDays: 365,
    canVerify: PLAN_ENTITLEMENTS.pro.canVerify,
    canExport: PLAN_ENTITLEMENTS.pro.canExportCsv,
    canAlerts: PLAN_ENTITLEMENTS.pro.canUseAlerts,
    canAudit: PLAN_ENTITLEMENTS.pro.canViewAuditLogs,
    canShare: false,
  },
  team: {
    monthlyCertificates: 10000,
    monthlyIngestEvents: 10000,
    retentionDays: 1095,
    canVerify: PLAN_ENTITLEMENTS.team.canVerify,
    canExport: PLAN_ENTITLEMENTS.team.canExportCsv,
    canAlerts: PLAN_ENTITLEMENTS.team.canUseAlerts,
    canAudit: PLAN_ENTITLEMENTS.team.canViewAuditLogs,
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

export type PlanEntitlements = (typeof PLAN_ENTITLEMENTS)[PlanTier] & {
  plan: PlanTier;
  isPaid: boolean;
  isTeam: boolean;
};

export function getPlanEntitlements(plan: PlanTier): PlanEntitlements {
  const flags = PLAN_ENTITLEMENTS[plan];
  const isPaid = plan !== 'free';
  const isTeam = plan === 'team';

  return {
    ...flags,
    plan,
    isPaid,
    isTeam,
  };
}
