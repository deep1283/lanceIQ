import { describe, expect, it } from 'vitest';
import {
  getPlanEntitlements,
  getPlanLimits,
  getRetentionExpiry,
  isPaidPlan,
} from '../plan';

describe('plan', () => {
  it('returns expected limits per tier', () => {
    expect(getPlanLimits('free').monthlyIngestEvents).toBe(100);
    expect(getPlanLimits('pro').monthlyIngestEvents).toBe(2000);
    expect(getPlanLimits('team').monthlyIngestEvents).toBe(10000);
  });

  it('computes retention expiry from plan', () => {
    const base = new Date('2026-01-15T00:00:00.000Z');

    expect(getRetentionExpiry('free', base).toISOString()).toBe('2026-01-22T00:00:00.000Z');
    expect(getRetentionExpiry('pro', base).toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(getRetentionExpiry('team', base).toISOString()).toBe('2029-01-15T00:00:00.000Z');
  });

  it('identifies paid plans', () => {
    expect(isPaidPlan('free')).toBe(false);
    expect(isPaidPlan('pro')).toBe(true);
    expect(isPaidPlan('team')).toBe(true);
  });

  it('maps entitlement matrix for free, pro, and team', () => {
    const free = getPlanEntitlements('free');
    const pro = getPlanEntitlements('pro');
    const team = getPlanEntitlements('team');

    expect(free.canExportPdf).toBe(true);
    expect(free.canExportCsv).toBe(false);
    expect(free.canVerify).toBe(false);
    expect(free.canRemoveWatermark).toBe(false);
    expect(free.canUseAlerts).toBe(false);
    expect(free.canUseSso).toBe(false);
    expect(free.canUseScim).toBe(false);
    expect(free.canUseAccessReviews).toBe(false);
    expect(free.canUseSlaIncidents).toBe(false);
    expect(free.canUseLegalHold).toBe(false);
    expect(free.canRotateKeys).toBe(false);
    expect(free.canViewAuditLogs).toBe(false);

    expect(pro.canExportPdf).toBe(true);
    expect(pro.canExportCsv).toBe(true);
    expect(pro.canVerify).toBe(true);
    expect(pro.canRemoveWatermark).toBe(true);
    expect(pro.canUseAlerts).toBe(false);
    expect(pro.canUseSso).toBe(false);
    expect(pro.canUseScim).toBe(false);
    expect(pro.canUseAccessReviews).toBe(false);
    expect(pro.canUseSlaIncidents).toBe(false);
    expect(pro.canUseLegalHold).toBe(false);
    expect(pro.canRotateKeys).toBe(false);
    expect(pro.canViewAuditLogs).toBe(false);

    expect(team.canExportPdf).toBe(true);
    expect(team.canExportCsv).toBe(true);
    expect(team.canVerify).toBe(true);
    expect(team.canRemoveWatermark).toBe(true);
    expect(team.canUseAlerts).toBe(true);
    expect(team.canUseSso).toBe(true);
    expect(team.canUseScim).toBe(true);
    expect(team.canUseAccessReviews).toBe(true);
    expect(team.canUseSlaIncidents).toBe(true);
    expect(team.canUseLegalHold).toBe(true);
    expect(team.canRotateKeys).toBe(true);
    expect(team.canViewAuditLogs).toBe(true);
  });
});
