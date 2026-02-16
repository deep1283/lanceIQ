import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOWNSTREAM_UNCONFIGURED_MESSAGE,
  reconciliationTestUtils,
  runProviderReconciliation,
} from '@/lib/delivery/reconciliation';

type ExistingCaseRow = {
  id: string;
  workspace_id: string;
  provider: string;
  provider_payment_id: string;
  status: 'open' | 'pending' | 'resolved' | 'ignored';
  reason_code: string | null;
  severity: string | null;
  created_at: string;
};

type MockConfig = {
  downstreamEnabled: boolean;
  receiptReceivedAt: string;
  snapshotState?: 'activated' | 'not_activated' | 'error';
  existingCases?: ExistingCaseRow[];
};

function createMockAdmin(config: MockConfig) {
  const calls: Array<{ table: string; action: string; payload?: unknown }> = [];
  const caseRows = [...(config.existingCases || [])];
  let createdCaseCounter = 0;

  return {
    calls,
    from(table: string) {
      const state: any = {
        action: 'select',
        eq: {} as Record<string, unknown>,
        in: {} as Record<string, unknown[]>,
      };

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          state.eq[column] = value;
          return builder;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          state.in[column] = values;
          return builder;
        }),
        not: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === 'workspace_reconciliation_settings') {
            return { data: { downstream_snapshots_enabled: config.downstreamEnabled }, error: null };
          }
          if (table === 'payment_reconciliation_cases' && state.eq.id) {
            const found = caseRows.find((row) => row.id === state.eq.id);
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        }),
        insert: vi.fn((payload: unknown) => {
          state.action = 'insert';
          state.insertPayload = payload;
          calls.push({ table, action: 'insert', payload });
          return builder;
        }),
        update: vi.fn((payload: unknown) => {
          state.action = 'update';
          state.updatePayload = payload;
          calls.push({ table, action: 'update', payload });
          return builder;
        }),
        upsert: vi.fn(async (payload: unknown) => {
          calls.push({ table, action: 'upsert', payload });
          return { error: null };
        }),
        single: vi.fn(async () => {
          if (table === 'payment_reconciliation_cases' && state.action === 'insert') {
            createdCaseCounter += 1;
            const id = `case_${createdCaseCounter}`;
            return { data: { id }, error: null };
          }
          return { data: null, error: null };
        }),
        then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) => {
          let value: any = { data: [], error: null };

          if (table === 'provider_integrations' && state.action === 'select') {
            value = {
              data: [
                {
                  id: 'int_1',
                  workspace_id: 'ws_1',
                  provider_type: 'stripe',
                  config: null,
                  credentials_encrypted: 'sk_test_123',
                  is_active: true,
                  health_status: 'unknown',
                  last_synced_at: null,
                },
              ],
              error: null,
            };
          } else if (table === 'ingested_events') {
            value = {
              data: [
                {
                  id: 'ing_1',
                  provider_payment_id: 'pay_1',
                  provider_event_id: 'evt_1',
                  detected_provider: 'stripe',
                  signature_status: 'verified',
                  received_at: config.receiptReceivedAt,
                },
              ],
              error: null,
            };
          } else if (table === 'delivery_jobs') {
            value = {
              data: [{ ingested_event_id: 'ing_1', status: 'completed', created_at: '2026-02-16T00:00:00.000Z' }],
              error: null,
            };
          } else if (table === 'destination_state_snapshots') {
            value = {
              data: config.downstreamEnabled
                ? [
                    {
                      id: 'snap_1',
                      provider: 'stripe',
                      provider_payment_id: 'pay_1',
                      downstream_state: config.snapshotState || 'activated',
                      reason_code: null,
                      observed_at: '2026-02-16T00:00:00.000Z',
                    },
                  ]
                : [],
              error: null,
            };
          } else if (table === 'payment_reconciliation_cases' && state.action === 'select') {
            let rows = [...caseRows];
            const workspaceId = state.eq.workspace_id as string | undefined;
            if (workspaceId) {
              rows = rows.filter((row) => row.workspace_id === workspaceId);
            }
            const providerPaymentIds = state.in.provider_payment_id as string[] | undefined;
            if (providerPaymentIds?.length) {
              rows = rows.filter((row) => providerPaymentIds.includes(row.provider_payment_id));
            }
            const statuses = state.in.status as string[] | undefined;
            if (statuses?.length) {
              rows = rows.filter((row) => statuses.includes(row.status));
            }
            value = { data: rows, error: null };
          }

          return Promise.resolve(value).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

describe('reconciliation V6.2 classification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns downstream_unconfigured in 2-way mode', async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'pay_1' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const admin = createMockAdmin({
      downstreamEnabled: false,
      receiptReceivedAt: new Date(now - 2 * 60 * 1000).toISOString(),
    });

    const result = await runProviderReconciliation({ admin, workspaceId: 'ws_1' });
    expect(result.error).toBeNull();
    if (result.error) return;

    expect(result.coverageMode).toBe('two_way_active');
    expect(result.downstreamStatus).toBe('downstream_unconfigured');
    expect(result.reportJson.discrepancy_counters.downstream_unconfigured).toBe(1);
    expect(result.reportJson.discrepancy_counters.downstream_not_activated).toBe(0);
    expect(result.reportJson.notes).toContain(DOWNSTREAM_UNCONFIGURED_MESSAGE);
  });

  it('keeps 3-way not_activated records in pending within grace window', async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'pay_1' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const admin = createMockAdmin({
      downstreamEnabled: true,
      receiptReceivedAt: new Date(now - 5 * 60 * 1000).toISOString(),
      snapshotState: 'not_activated',
    });

    const result = await runProviderReconciliation({ admin, workspaceId: 'ws_1' });
    expect(result.error).toBeNull();
    if (result.error) return;

    expect(result.coverageMode).toBe('three_way_active');
    expect(result.reportJson.discrepancy_counters.pending_activation).toBe(1);
    expect(result.reportJson.discrepancy_counters.downstream_not_activated).toBe(0);
    expect(result.caseStats.opened).toBe(0);
    expect(result.caseStats.resolved).toBe(0);
  });

  it('opens case for confirmed downstream mismatch after grace window', async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'pay_1' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const admin = createMockAdmin({
      downstreamEnabled: true,
      receiptReceivedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      snapshotState: 'not_activated',
    });

    const result = await runProviderReconciliation({ admin, workspaceId: 'ws_1' });
    expect(result.error).toBeNull();
    if (result.error) return;

    expect(result.reportJson.discrepancy_counters.downstream_not_activated).toBe(1);
    expect(result.reportJson.discrepancy_counters.pending_activation).toBe(0);
    expect(result.caseStats.opened).toBe(1);

    const createdCase = admin.calls.find(
      (call) => call.table === 'payment_reconciliation_cases' && call.action === 'insert'
    );
    expect(createdCase).toBeTruthy();
  });

  it('auto-resolves active case when signals are now healthy', async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'pay_1' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const admin = createMockAdmin({
      downstreamEnabled: true,
      receiptReceivedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      snapshotState: 'activated',
      existingCases: [
        {
          id: 'case_open_1',
          workspace_id: 'ws_1',
          provider: 'stripe',
          provider_payment_id: 'pay_1',
          status: 'open',
          reason_code: 'delivery_failure',
          severity: 'medium',
          created_at: '2026-02-16T00:00:00.000Z',
        },
      ],
    });

    const result = await runProviderReconciliation({ admin, workspaceId: 'ws_1', actorId: 'user_1' });
    expect(result.error).toBeNull();
    if (result.error) return;

    expect(result.caseStats.resolved).toBe(1);
    const resolvedUpdate = admin.calls.find(
      (call) =>
        call.table === 'payment_reconciliation_cases' &&
        call.action === 'update' &&
        (call.payload as Record<string, unknown>)?.status === 'resolved'
    );
    expect(resolvedUpdate).toBeTruthy();

    const autoResolvedEvent = admin.calls.find(
      (call) =>
        call.table === 'payment_reconciliation_case_events' &&
        call.action === 'insert' &&
        (call.payload as Record<string, unknown>)?.event_type === 'auto_resolved'
    );
    expect(autoResolvedEvent).toBeTruthy();
  });

  it('does not auto-resolve during downstream grace window', async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'pay_1' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const admin = createMockAdmin({
      downstreamEnabled: true,
      receiptReceivedAt: new Date(now - 5 * 60 * 1000).toISOString(),
      snapshotState: 'not_activated',
      existingCases: [
        {
          id: 'case_open_2',
          workspace_id: 'ws_1',
          provider: 'stripe',
          provider_payment_id: 'pay_1',
          status: 'open',
          reason_code: 'confirmed_missing_activation',
          severity: 'medium',
          created_at: '2026-02-16T00:00:00.000Z',
        },
      ],
    });

    const result = await runProviderReconciliation({ admin, workspaceId: 'ws_1', actorId: 'user_1' });
    expect(result.error).toBeNull();
    if (result.error) return;

    expect(result.caseStats.resolved).toBe(0);
    const resolvedUpdates = admin.calls.filter(
      (call) =>
        call.table === 'payment_reconciliation_cases' &&
        call.action === 'update' &&
        (call.payload as Record<string, unknown>)?.status === 'resolved'
    );
    expect(resolvedUpdates.length).toBe(0);
  });

  it('exposes downstream state evaluator behavior', () => {
    const nowMs = Date.now();
    expect(
      reconciliationTestUtils.evaluateDownstreamStatus({
        downstreamConfigured: false,
        snapshotState: null,
        receiptReceivedAt: new Date(nowMs).toISOString(),
        nowMs,
      }).state
    ).toBe('downstream_unconfigured');
  });
});
