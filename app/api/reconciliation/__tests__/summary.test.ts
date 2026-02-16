import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

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
}));

vi.mock('@/lib/delivery/api', () => ({
  getApiClients: mocks.getApiClients,
  requireUser: mocks.requireUser,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
  canUseReconciliationEntitlement: mocks.canUseReconciliationEntitlement,
  isValidUuid: mocks.isValidUuid,
  apiError: mocks.apiError,
}));

import { GET } from '@/app/api/reconciliation/summary/route';

function makeAdmin() {
  return {
    from: vi.fn((table: string) => {
      const state: any = { action: 'select' };
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === 'workspace_reconciliation_settings') {
            return { data: { downstream_snapshots_enabled: false }, error: null };
          }
          return { data: null, error: null };
        }),
        then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) => {
          if (table === 'reconciliation_runs') {
            return Promise.resolve({
              data: [
                {
                  id: 'run_1',
                  status: 'completed',
                  started_at: '2026-02-16T00:00:00.000Z',
                  completed_at: '2026-02-16T00:01:00.000Z',
                  items_processed: 10,
                  discrepancies_found: 2,
                  report_json: {
                    discrepancy_counters: {
                      missing_receipts: 1,
                      missing_deliveries: 1,
                      failed_verifications: 0,
                      provider_mismatches: 0,
                      downstream_unconfigured: 4,
                      pending_activation: 0,
                    },
                  },
                },
              ],
              error: null,
            }).then(resolve, reject);
          }
          if (table === 'payment_reconciliation_cases') {
            return Promise.resolve({
              data: [{ status: 'open' }, { status: 'resolved' }],
              error: null,
            }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    }),
  };
}

function req(url: string) {
  return { nextUrl: new URL(url) } as any;
}

describe('GET /api/reconciliation/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiClients.mockResolvedValue({ supabase: {}, admin: makeAdmin() });
    mocks.requireUser.mockResolvedValue({ id: 'user_1' });
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: true, role: 'member' });
    mocks.isValidUuid.mockReturnValue(true);
  });

  it('returns explicit downstream_unconfigured state in 2-way mode', async () => {
    const response = await GET(
      req(`https://example.com/api/reconciliation/summary?workspace_id=${WORKSPACE_ID}`)
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.coverage_mode).toBe('two_way_active');
    expect(payload.downstream_activation_status).toBe('downstream_unconfigured');
    expect(payload.downstream_status_message).toBe('Downstream activation status not configured.');
    expect(payload.cases).toMatchObject({ total: 2, open: 1, resolved: 1 });
  });
});
