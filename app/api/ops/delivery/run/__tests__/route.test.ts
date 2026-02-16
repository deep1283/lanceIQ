import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApiClients: vi.fn(),
  requireUser: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  requireWorkspaceEntitlementOnly: vi.fn(),
  isOpsServiceTokenAuthorized: vi.fn(),
  canUseForwardingEntitlement: vi.fn(() => true),
  isValidUuid: vi.fn(),
  apiError: vi.fn((message: string, status: number, code: string, id: string | null = null) => ({
    body: { status: 'error', id, error: message, error_code: code },
    status,
  })),
  runDeliveryWorker: vi.fn(),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/delivery/api', () => ({
  getApiClients: mocks.getApiClients,
  requireUser: mocks.requireUser,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
  requireWorkspaceEntitlementOnly: mocks.requireWorkspaceEntitlementOnly,
  isOpsServiceTokenAuthorized: mocks.isOpsServiceTokenAuthorized,
  canUseForwardingEntitlement: mocks.canUseForwardingEntitlement,
  isValidUuid: mocks.isValidUuid,
  apiError: mocks.apiError,
}));

vi.mock('@/lib/delivery/service', () => ({
  runDeliveryWorker: mocks.runDeliveryWorker,
}));

vi.mock('@/utils/audit', () => ({
  AUDIT_ACTIONS: {
    DELIVERY_RUN_TRIGGERED: 'delivery.run_triggered',
  },
  logAuditAction: mocks.logAuditAction,
}));

import { POST } from '@/app/api/ops/delivery/run/route';

function jsonRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: () => null },
  } as any;
}

describe('POST /api/ops/delivery/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiClients.mockResolvedValue({ supabase: {}, admin: {} });
    mocks.requireUser.mockResolvedValue({ id: 'user_1' });
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: true, role: 'owner' });
    mocks.requireWorkspaceEntitlementOnly.mockResolvedValue({ ok: true });
    mocks.isOpsServiceTokenAuthorized.mockReturnValue(false);
    mocks.isValidUuid.mockReturnValue(true);
    mocks.runDeliveryWorker.mockResolvedValue({ error: null, results: [{ job_id: 'job_1' }] });
  });

  it('allows service-token scheduled runs without user session', async () => {
    mocks.isOpsServiceTokenAuthorized.mockReturnValue(true);

    const response = await POST(
      jsonRequest({ workspace_id: '11111111-1111-1111-1111-111111111111', limit: 5 })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.requireWorkspaceEntitlementOnly).toHaveBeenCalledTimes(1);
    expect(mocks.runDeliveryWorker).toHaveBeenCalledWith(
      expect.objectContaining({ runnerId: 'ops:service', limit: 5 })
    );
    expect(mocks.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ trigger_mode: 'service_token' }) })
    );
  });

  it('keeps manual owner/admin trigger path', async () => {
    const response = await POST(
      jsonRequest({ workspace_id: '11111111-1111-1111-1111-111111111111', limit: 3 })
    );

    expect(response.status).toBe(200);
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledTimes(1);
    expect(mocks.runDeliveryWorker).toHaveBeenCalledWith(
      expect.objectContaining({ runnerId: 'api:user_1', limit: 3 })
    );
  });
});
