import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runProviderReconciliation } from '@/lib/delivery/reconciliation';

type QueryState = {
  table: string;
  action: 'select' | 'update';
  updatePayload?: Record<string, unknown>;
};

function createMockAdmin() {
  const calls: Array<{ table: string; action: string; payload?: unknown }> = [];

  function resultFor(state: QueryState) {
    if (state.table === 'provider_integrations' && state.action === 'select') {
      return {
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
    }

    if (state.table === 'provider_integrations' && state.action === 'update') {
      calls.push({ table: state.table, action: 'update', payload: state.updatePayload });
      return { data: null, error: null };
    }

    if (state.table === 'ingested_events') {
      return {
        data: [
          {
            id: 'ing_1',
            provider_event_id: 'evt_present',
            detected_provider: 'stripe',
            signature_status: 'verified',
          },
          {
            id: 'ing_2',
            provider_event_id: 'evt_missing',
            detected_provider: 'stripe',
            signature_status: 'failed',
          },
        ],
        error: null,
      };
    }

    if (state.table === 'delivery_jobs') {
      return {
        data: [{ ingested_event_id: 'ing_1' }],
        error: null,
      };
    }

    return { data: [], error: null };
  }

  return {
    calls,
    from(table: string) {
      const state: QueryState = { table, action: 'select' };
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        not: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        update: vi.fn((payload: Record<string, unknown>) => {
          state.action = 'update';
          state.updatePayload = payload;
          return builder;
        }),
        upsert: vi.fn(async (payload: unknown) => {
          calls.push({ table, action: 'upsert', payload });
          return { error: null };
        }),
        then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) =>
          Promise.resolve(resultFor(state)).then(resolve, reject),
      };
      return builder;
    },
  };
}

describe('provider reconciliation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('computes mismatch counters from provider pulls vs ingest/delivery evidence', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: 'evt_present' }, { id: 'evt_provider_only' }] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const admin = createMockAdmin();
    const result = await runProviderReconciliation({
      admin,
      workspaceId: 'ws_1',
    });

    expect(result.error).toBeNull();
    if (result.error) return;

    expect(result.itemsProcessed).toBe(4);
    expect(result.discrepanciesFound).toBe(3);
    expect(result.reportJson.discrepancy_counters).toMatchObject({
      missing_receipts: 1,
      missing_deliveries: 1,
      failed_verifications: 1,
      provider_mismatches: 0,
    });

    const upsertCall = admin.calls.find((call) => call.table === 'provider_objects' && call.action === 'upsert');
    expect(upsertCall).toBeTruthy();
  });
});
