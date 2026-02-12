import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    createServerClient: vi.fn(),
    paymentRetrieve: vi.fn(),
    logAuditAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@/lib/dodo', () => ({
  dodo: {
    payments: {
      retrieve: mocks.paymentRetrieve,
    },
  },
}));

vi.mock('@/utils/audit', () => ({
  AUDIT_ACTIONS: {
    PLAN_CHANGED: 'plan.changed',
  },
  logAuditAction: mocks.logAuditAction,
}));

import { POST as verifyPost } from '@/app/api/dodo/verify/route';
import { POST as verifyPaymentPost } from '@/app/api/dodo/verify-payment/route';

type SupabaseOptions = {
  userId: string | null;
  isMember?: boolean;
  workspacePlan?: { plan: string; subscription_status: string } | null;
};

function makeQueryBuilder(result: unknown) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
  };
  return builder;
}

function makeSupabaseClient(options: SupabaseOptions) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.userId ? { id: options.userId } : null } })),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return makeQueryBuilder(options.isMember === false ? null : { workspace_id: 'ws_1' });
      }
      if (table === 'workspaces') {
        return makeQueryBuilder(options.workspacePlan ?? { plan: 'pro', subscription_status: 'active' });
      }
      return makeQueryBuilder(null);
    }),
  };
}

function jsonRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
  } as any;
}

describe('Billing security hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects email-only unlock flow via explicit deprecation response', async () => {
    mocks.createServerClient.mockResolvedValue(makeSupabaseClient({ userId: 'user_1', isMember: true }));

    const response = await verifyPost(jsonRequest({ email: 'user@example.com', workspaceId: 'ws_1' }));
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload.status).toBe('deprecated');
    expect(payload.plan_changed).toBe(false);
  });

  it('rejects verify-payment calls without authentication', async () => {
    mocks.createServerClient.mockResolvedValue(makeSupabaseClient({ userId: null }));

    const response = await verifyPaymentPost(jsonRequest({ payment_id: 'pay_123', workspace_id: 'ws_1' }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toMatch(/unauthorized/i);
  });

  it('rejects verify-payment calls with workspace/user proof mismatch', async () => {
    mocks.createServerClient.mockResolvedValue(makeSupabaseClient({ userId: 'user_1', isMember: true }));
    mocks.paymentRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: {
        workspace_id: 'ws_other',
        user_id: 'user_1',
      },
    });

    const response = await verifyPaymentPost(jsonRequest({ payment_id: 'pay_123', workspace_id: 'ws_1' }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/proof/i);
  });

  it('does not leak PII in successful verify-payment response', async () => {
    mocks.createServerClient.mockResolvedValue(makeSupabaseClient({ userId: 'user_1', isMember: true }));
    mocks.paymentRetrieve.mockResolvedValue({
      status: 'succeeded',
      metadata: {
        workspace_id: 'ws_1',
        user_id: 'user_1',
      },
      customer: {
        email: 'private@example.com',
        name: 'Private Name',
      },
    });

    const response = await verifyPaymentPost(jsonRequest({ payment_id: 'pay_123', workspace_id: 'ws_1' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.paid).toBe(true);
    expect(payload.verified).toBe(true);
    expect(payload.plan_changed).toBe(false);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('name');
  });
});
