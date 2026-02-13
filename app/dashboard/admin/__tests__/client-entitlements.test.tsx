import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  section: 'alerts',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'section' ? mocks.section : null),
  }),
}));

vi.mock('@/app/actions/alert-settings', () => ({
  updateAlertSettings: vi.fn(async () => ({})),
}));

vi.mock('@/app/actions/members', () => ({
  inviteMember: vi.fn(async () => ({})),
  removeMember: vi.fn(async () => ({})),
}));

vi.mock('@/app/dashboard/settings/actions', () => ({
  createScimToken: vi.fn(async () => ({})),
  revokeScimToken: vi.fn(async () => ({})),
  saveSsoProvider: vi.fn(async () => ({})),
}));

import AdminClient from '@/app/dashboard/admin/client';

const FREE_EFFECTIVE_ENTITLEMENTS = {
  plan: 'free' as const,
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
} as const;

describe('Admin client effective entitlements gating', () => {
  it('renders Team Feature lock state from effective entitlements even when workspace.plan is team', () => {
    const html = renderToStaticMarkup(
      <AdminClient
        workspace={{
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Workspace',
          plan: 'team',
          subscription_status: 'active',
          raw_body_retention_days: 30,
        }}
        initialEntitlements={FREE_EFFECTIVE_ENTITLEMENTS}
        initialSettings={null}
        initialAuditLogs={[]}
        initialMembers={[]}
        currentUserId="user_1"
        currentUserRole="owner"
        initialSsoProviders={[]}
        initialScimTokens={[]}
        initialAccessReviewCycles={[]}
        initialAccessReviewDecisions={[]}
        initialLegalHold={null}
        initialIncidents={[]}
        initialSlaSummary={null}
        initialRetentionJobs={[]}
        initialRetentionExecutions={[]}
      />
    );

    expect(html).toContain('Team Feature');
    expect(html).toContain('Available on Team plan.');
    expect(html).toContain('Upgrade to Team');
    expect(html).not.toContain('Smart Alerts');
  });
});
