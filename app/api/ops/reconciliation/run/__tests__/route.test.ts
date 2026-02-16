import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApiClients: vi.fn(),
  requireUser: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  requireWorkspaceEntitlementOnly: vi.fn(),
  isOpsServiceTokenAuthorized: vi.fn(),
  canUseReconciliationEntitlement: vi.fn(() => true),
  isValidUuid: vi.fn(),
  apiError: vi.fn((message: string, status: number, code: string, id: string | null = null) => ({
    body: { status: 'error', id, error: message, error_code: code },
    status,
  })),
  runProviderReconciliation: vi.fn(),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/delivery/api', () => ({
  getApiClients: mocks.getApiClients,
  requireUser: mocks.requireUser,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
  requireWorkspaceEntitlementOnly: mocks.requireWorkspaceEntitlementOnly,
  isOpsServiceTokenAuthorized: mocks.isOpsServiceTokenAuthorized,
  canUseReconciliationEntitlement: mocks.canUseReconciliationEntitlement,
  isValidUuid: mocks.isValidUuid,
  apiError: mocks.apiError,
}));

vi.mock('@/lib/delivery/reconciliation', () => ({
  runProviderReconciliation: mocks.runProviderReconciliation,
}));

vi.mock('@/utils/audit', () => ({
  AUDIT_ACTIONS: {
    RECONCILIATION_RUN_TRIGGERED: 'reconciliation.run_triggered',
  },
  logAuditAction: mocks.logAuditAction,
}));

import { POST } from '@/app/api/ops/reconciliation/run/route';

function createAdminMock() {
  const state: { action: 'select' | 'insert' | 'update' } = { action: 'select' };
  const builder: any = {
    insert: vi.fn(() => {
      state.action = 'insert';
      return builder;
    }),
    update: vi.fn(() => {
      state.action = 'update';
      return builder;
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({
      data: state.action === 'insert' ? { id: 'run_1' } : null,
      error: null,
    })),
    then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
  };

  return {
    from: vi.fn(() => builder),
  };
}

function jsonRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: () => null },
  } as any;
}

describe('POST /api/ops/reconciliation/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: 'user_1' });
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: true, role: 'owner' });
    mocks.requireWorkspaceEntitlementOnly.mockResolvedValue({ ok: true });
    mocks.isOpsServiceTokenAuthorized.mockReturnValue(false);
    mocks.isValidUuid.mockReturnValue(true);
    mocks.runProviderReconciliation.mockResolvedValue({
      error: null,
      itemsProcessed: 10,
      discrepanciesFound: 2,
      reportJson: { discrepancy_counters: { missing_receipts: 1 } },
    });
  });

  it('supports service-token runner path', async () => {
    const admin = createAdminMock();
    mocks.getApiClients.mockResolvedValue({ supabase: {}, admin });
    mocks.isOpsServiceTokenAuthorized.mockReturnValue(true);

    const response = await POST(
      jsonRequest({ workspace_id: '11111111-1111-1111-1111-111111111111' })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.requireWorkspaceEntitlementOnly).toHaveBeenCalledTimes(1);
    expect(mocks.runProviderReconciliation).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ trigger_mode: 'service_token' }) })
    );
  });

  it('keeps manual owner/admin path', async () => {
    const admin = createAdminMock();
    mocks.getApiClients.mockResolvedValue({ supabase: {}, admin });

    const response = await POST(
      jsonRequest({ workspace_id: '11111111-1111-1111-1111-111111111111' })
    );

    expect(response.status).toBe(200);
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user_1' })
    );
  });
});
