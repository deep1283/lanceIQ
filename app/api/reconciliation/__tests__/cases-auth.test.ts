import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const CASE_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  getApiClients: vi.fn(),
  requireUser: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  canUseReconciliationEntitlement: vi.fn(() => true),
  isValidUuid: vi.fn(),
  apiError: vi.fn((message: string, status: number, code: string, id: string | null = null) => ({
    body: { status: 'error', id, error: message, error_code: code },
    status,
  })),
  listActiveDeliveryTargets: vi.fn(),
  enqueueDeliveryJob: vi.fn(),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/delivery/api', () => ({
  getApiClients: mocks.getApiClients,
  requireUser: mocks.requireUser,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
  canUseReconciliationEntitlement: mocks.canUseReconciliationEntitlement,
  isValidUuid: mocks.isValidUuid,
  apiError: mocks.apiError,
}));

vi.mock('@/lib/delivery/service', () => ({
  listActiveDeliveryTargets: mocks.listActiveDeliveryTargets,
  enqueueDeliveryJob: mocks.enqueueDeliveryJob,
}));

vi.mock('@/utils/audit', () => ({
  AUDIT_ACTIONS: {
    RECONCILIATION_CASE_REPLAY_TRIGGERED: 'reconciliation.case_replay_triggered',
    RECONCILIATION_CASE_RESOLVED: 'reconciliation.case_resolved',
  },
  logAuditAction: mocks.logAuditAction,
}));

import { GET as listCasesGet } from '@/app/api/reconciliation/cases/route';
import { POST as replayCasePost } from '@/app/api/reconciliation/cases/[id]/replay/route';
import { POST as resolveCasePost } from '@/app/api/reconciliation/cases/[id]/resolve/route';

function createAdminMock() {
  function makeBuilder(table: string) {
    const state: any = { action: 'select' };

    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === 'payment_reconciliation_cases') {
          return {
            data: {
              id: CASE_ID,
              workspace_id: WORKSPACE_ID,
              provider: 'stripe',
              provider_payment_id: 'pay_1',
              status: 'open',
            },
            error: null,
          };
        }
        if (table === 'ingested_events') {
          return {
            data: {
              id: 'evt_1',
              workspace_id: WORKSPACE_ID,
              detected_provider: 'stripe',
              provider_payment_id: 'pay_1',
              raw_body: '{"ok":true}',
              headers: { 'content-type': 'application/json' },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      update: vi.fn(() => {
        state.action = 'update';
        return builder;
      }),
      insert: vi.fn(async () => ({ error: null })),
      single: vi.fn(async () => {
        if (table === 'payment_reconciliation_cases' && state.action === 'update') {
          return {
            data: {
              id: CASE_ID,
              status: 'resolved',
              resolved_at: '2026-02-16T00:00:00.000Z',
              resolved_by: 'user_1',
              resolution_note: 'resolved',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) => {
        if (table === 'payment_reconciliation_cases' && state.action === 'select') {
          const value = {
            data: [
              {
                id: CASE_ID,
                workspace_id: WORKSPACE_ID,
                provider: 'stripe',
                provider_payment_id: 'pay_1',
                status: 'open',
              },
            ],
            error: null,
          };
          return Promise.resolve(value).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };

    return builder;
  }

  return {
    from: vi.fn((table: string) => makeBuilder(table)),
  };
}

function getRequest(url: string) {
  return { nextUrl: new URL(url) } as any;
}

function postRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
  } as any;
}

describe('reconciliation case APIs auth and gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiClients.mockResolvedValue({ supabase: {}, admin: createAdminMock() });
    mocks.requireUser.mockResolvedValue({ id: 'user_1' });
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: true, role: 'owner' });
    mocks.isValidUuid.mockReturnValue(true);
    mocks.listActiveDeliveryTargets.mockResolvedValue({
      error: null,
      targets: [{ id: 'tgt_1', workspace_id: WORKSPACE_ID, is_active: true }],
    });
    mocks.enqueueDeliveryJob.mockResolvedValue({ job: { id: 'job_1' }, error: null });
  });

  it('blocks case list when entitlement/role access is denied', async () => {
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, body: { error: 'Forbidden' } });

    const response = await listCasesGet(
      getRequest(`https://example.com/api/reconciliation/cases?workspace_id=${WORKSPACE_ID}`)
    );

    expect(response.status).toBe(403);
  });

  it('enforces owner/admin for replay action', async () => {
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, body: { error: 'Forbidden' } });

    const response = await replayCasePost(
      postRequest({ workspace_id: WORKSPACE_ID }),
      { params: Promise.resolve({ id: CASE_ID }) }
    );

    expect(response.status).toBe(403);
  });

  it('enforces owner/admin for resolve action', async () => {
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, body: { error: 'Forbidden' } });

    const response = await resolveCasePost(
      postRequest({ workspace_id: WORKSPACE_ID, resolution_note: 'resolved' }),
      { params: Promise.resolve({ id: CASE_ID }) }
    );

    expect(response.status).toBe(403);
  });

  it('allows replay for owner/admin and logs action', async () => {
    const response = await replayCasePost(
      postRequest({ workspace_id: WORKSPACE_ID }),
      { params: Promise.resolve({ id: CASE_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(mocks.enqueueDeliveryJob).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reconciliation.case_replay_triggered' })
    );
  });

  it('allows resolve for owner/admin and logs action', async () => {
    const response = await resolveCasePost(
      postRequest({ workspace_id: WORKSPACE_ID, resolution_note: 'resolved' }),
      { params: Promise.resolve({ id: CASE_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.case.status).toBe('resolved');
    expect(mocks.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reconciliation.case_resolved' })
    );
  });
});
