import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/admin',
  useSearchParams: () => new URLSearchParams('section=alerts'),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import DashboardSidebar from '@/components/DashboardSidebar';

type EffectiveEntitlements = Parameters<typeof DashboardSidebar>[0]['initialEntitlements'];

function makeEntitlements(overrides: Partial<EffectiveEntitlements> = {}): EffectiveEntitlements {
  return {
    plan: 'free',
    isPaid: false,
    isTeam: false,
    isPro: false,
    canExportPdf: true,
    canExportCsv: false,
    canVerify: false,
    canRemoveWatermark: false,
    canUseAlerts: false,
    canUseSso: false,
    canUseScim: false,
    canUseAccessReviews: false,
    canUseSlaIncidents: false,
    canUseLegalHold: false,
    canRotateKeys: false,
    canViewAuditLogs: false,
    ...overrides,
  } as EffectiveEntitlements;
}

describe('Dashboard sidebar entitlement source', () => {
  it('locks Team sections when effective entitlements deny access even if plan looks Team', () => {
    const markup = renderToStaticMarkup(
      <DashboardSidebar
        initialEntitlements={makeEntitlements({
          plan: 'team',
          isPaid: true,
          isTeam: true,
          isPro: true,
          canUseAlerts: false,
          canViewAuditLogs: false,
          canUseLegalHold: false,
          canUseSso: false,
          canUseScim: false,
          canUseAccessReviews: false,
          canUseSlaIncidents: false,
        })}
      />
    );

    expect(markup).toContain('Smart Alerts');
    expect(markup).toContain('Team Feature: Available on Team plan.');
  });

  it('unlocks Team sections when effective entitlements allow access', () => {
    const markup = renderToStaticMarkup(
      <DashboardSidebar
        initialEntitlements={makeEntitlements({
          plan: 'team',
          isPaid: true,
          isTeam: true,
          isPro: true,
          canUseAlerts: true,
          canViewAuditLogs: true,
          canUseLegalHold: true,
          canUseSso: true,
          canUseScim: true,
          canUseAccessReviews: true,
          canUseSlaIncidents: true,
        })}
      />
    );

    expect(markup).toContain('Smart Alerts');
    expect(markup).not.toContain('Team Feature: Available on Team plan.');
  });
});
