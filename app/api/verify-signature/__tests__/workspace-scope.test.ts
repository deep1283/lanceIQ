import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  checkPlanEntitlements: vi.fn(),
  rateLimitCheck: vi.fn(async () => undefined),
  detectProvider: vi.fn(() => 'stripe'),
  verifySignature: vi.fn(() => ({
    status: 'verified',
    reason: null,
    error: null,
    method: 'hmac_sha256',
    secretHint: 'whsec_...abcd',
    providerEventId: 'evt_123',
    toleranceUsedSec: 300,
  })),
  computeRawBodySha256: vi.fn(() => 'sha256_hash'),
  signVerificationToken: vi.fn(() => 'token_123'),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@/app/actions/subscription', () => ({
  checkPlanEntitlements: mocks.checkPlanEntitlements,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({
    check: mocks.rateLimitCheck,
  }),
}));

vi.mock('@/lib/signature-verification', () => ({
  detectProvider: mocks.detectProvider,
  verifySignature: mocks.verifySignature,
  computeRawBodySha256: mocks.computeRawBodySha256,
}));

vi.mock('@/lib/verification-token', () => ({
  signVerificationToken: mocks.signVerificationToken,
}));

import { POST } from '@/app/api/verify-signature/route';

type SupabaseScenario = {
  userId: string | null;
  memberships: string[];
};

function makeSupabaseClient(scenario: SupabaseScenario) {
  function makeMembershipBuilder() {
    const state: { workspaceId?: string } = {};
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: string) => {
        if (column === 'workspace_id') state.workspaceId = value;
        return builder;
      }),
      maybeSingle: vi.fn(async () => {
        const candidate = state.workspaceId;
        const data =
          candidate && scenario.memberships.includes(candidate)
            ? { workspace_id: candidate }
            : null;
        return { data, error: null };
      }),
      then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) => {
        const data = scenario.memberships.map((workspaceId) => ({ workspace_id: workspaceId }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: scenario.userId ? { id: scenario.userId } : null },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return makeMembershipBuilder();
      }
      const passthrough: any = {
        update: vi.fn(() => passthrough),
        eq: vi.fn(() => passthrough),
      };
      return passthrough;
    }),
  };
}

function makeRequest(body: Record<string, unknown>) {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as any;
}

const PRO_ENTITLEMENTS = {
  plan: 'pro' as const,
  isPro: true,
  isPaid: true,
  isTeam: false,
  canExportPdf: true,
  canExportCsv: true,
  canVerify: true,
  canRemoveWatermark: true,
  canUseForwarding: true,
  canUseReconciliation: true,
  canUseAlerts: false,
  canUseSso: false,
  canUseScim: false,
  canUseAccessReviews: false,
  canUseSlaIncidents: false,
  canUseLegalHold: false,
  canRotateKeys: false,
  canViewAuditLogs: false,
};

const FREE_ENTITLEMENTS = {
  ...PRO_ENTITLEMENTS,
  plan: 'free' as const,
  isPro: false,
  isPaid: false,
  canExportCsv: false,
  canVerify: false,
  canRemoveWatermark: false,
  canUseForwarding: false,
};

describe('POST /api/verify-signature workspace scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPlanEntitlements.mockResolvedValue(PRO_ENTITLEMENTS);
  });

  it('returns 400 when workspace_id is missing and user has multiple workspaces', async () => {
    mocks.createServerClient.mockResolvedValue(
      makeSupabaseClient({ userId: 'user_1', memberships: ['ws_1', 'ws_2'] })
    );

    const response = await POST(
      makeRequest({
        rawBody: '{"ok":true}',
        headers: { 'stripe-signature': 'sig' },
        secret: 'whsec_test',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/workspace_id/i);
    expect(mocks.checkPlanEntitlements).not.toHaveBeenCalled();
  });

  it('returns 403 when workspace_id is not a member workspace', async () => {
    mocks.createServerClient.mockResolvedValue(
      makeSupabaseClient({ userId: 'user_1', memberships: ['ws_1'] })
    );

    const response = await POST(
      makeRequest({
        rawBody: '{"ok":true}',
        headers: { 'stripe-signature': 'sig' },
        secret: 'whsec_test',
        workspace_id: 'ws_2',
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.checkPlanEntitlements).not.toHaveBeenCalled();
  });

  it('returns 403 when workspace is not entitled to verify', async () => {
    mocks.createServerClient.mockResolvedValue(
      makeSupabaseClient({ userId: 'user_1', memberships: ['ws_1'] })
    );
    mocks.checkPlanEntitlements.mockResolvedValue(FREE_ENTITLEMENTS);

    const response = await POST(
      makeRequest({
        rawBody: '{"ok":true}',
        headers: { 'stripe-signature': 'sig' },
        secret: 'whsec_test',
        workspace_id: 'ws_1',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/upgrade/i);
    expect(mocks.checkPlanEntitlements).toHaveBeenCalledWith('ws_1');
  });

  it('uses single workspace membership when workspace_id is omitted', async () => {
    mocks.createServerClient.mockResolvedValue(
      makeSupabaseClient({ userId: 'user_1', memberships: ['ws_1'] })
    );

    const response = await POST(
      makeRequest({
        rawBody: '{"ok":true}',
        headers: { 'stripe-signature': 'sig' },
        secret: 'whsec_test',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('verified');
    expect(payload.workspaceId).toBe('ws_1');
    expect(mocks.checkPlanEntitlements).toHaveBeenCalledWith('ws_1');
  });
});
