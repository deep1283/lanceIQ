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

  it('maps entitlements for free and team', () => {
    const free = getPlanEntitlements('free');
    const team = getPlanEntitlements('team');

    expect(free.canExportPdf).toBe(true);
    expect(free.canExportCsv).toBe(false);
    expect(free.canRemoveWatermark).toBe(false);
    expect(team.canUseSso).toBe(true);
    expect(team.canRotateKeys).toBe(true);
    expect(team.canViewAuditLogs).toBe(true);
  });
});
