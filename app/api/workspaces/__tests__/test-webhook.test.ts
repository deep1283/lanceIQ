import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  getApiClients: vi.fn(),
  requireUser: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  canUseForwardingEntitlement: vi.fn(() => true),
  isValidUuid: vi.fn(),
  apiError: vi.fn((message: string, status: number, code: string, id: string | null = null) => ({
    body: { status: 'error', id, error: message, error_code: code },
    status,
  })),
  enqueueDeliveryJob: vi.fn(),
  runDeliveryJobById: vi.fn(),
  hashApiKey: vi.fn(),
  processIngestEvent: vi.fn(),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/delivery/api', () => ({
  getApiClients: mocks.getApiClients,
  requireUser: mocks.requireUser,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
  canUseForwardingEntitlement: mocks.canUseForwardingEntitlement,
  isValidUuid: mocks.isValidUuid,
  apiError: mocks.apiError,
}));

vi.mock('@/lib/delivery/service', () => ({
  enqueueDeliveryJob: mocks.enqueueDeliveryJob,
  runDeliveryJobById: mocks.runDeliveryJobById,
}));

vi.mock('@/lib/api-key', () => ({
  hashApiKey: mocks.hashApiKey,
}));

vi.mock('@/lib/ingest-core', () => ({
  processIngestEvent: mocks.processIngestEvent,
}));

vi.mock('@/utils/audit', () => ({
  AUDIT_ACTIONS: {
    DELIVERY_TEST_SENT: 'delivery.test_sent',
  },
  logAuditAction: mocks.logAuditAction,
}));

import { POST } from '@/app/api/workspaces/test-webhook/route';

function jsonRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
  } as any;
}

describe('POST /api/workspaces/test-webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const emptyBuilder = {
      select: vi.fn(() => emptyBuilder),
      eq: vi.fn(() => emptyBuilder),
      gte: vi.fn(() => emptyBuilder),
      order: vi.fn(() => emptyBuilder),
      limit: vi.fn(() => emptyBuilder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const supabase = {
      from: vi.fn(() => emptyBuilder),
    };
    const admin = {
      from: vi.fn(() => emptyBuilder),
    };
    mocks.getApiClients.mockResolvedValue({ supabase, admin });
    mocks.requireUser.mockResolvedValue({ id: 'user_1' });
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: true, role: 'owner' });
    mocks.isValidUuid.mockReturnValue(true);
    mocks.enqueueDeliveryJob.mockResolvedValue({ job: { id: 'job_1' }, error: null });
    mocks.hashApiKey.mockReturnValue('hash_1');
    mocks.processIngestEvent.mockResolvedValue(
      NextResponse.json({ status: 'queued', id: 'evt_1' }, { status: 202 })
    );
    mocks.runDeliveryJobById.mockResolvedValue({
      ok: true,
      code: null,
      result: { statusCode: 200 },
    });
  });

  it('returns structured unauthorized error', async () => {
    mocks.requireUser.mockResolvedValue(null);

    const response = await POST(jsonRequest({}));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      status: 'error',
      id: null,
      error: 'Unauthorized',
      error_code: 'unauthorized',
    });
  });

  it('returns structured validation error on invalid ids', async () => {
    mocks.isValidUuid.mockReturnValue(false);

    const response = await POST(jsonRequest({ workspace_id: 'bad', target_id: 'bad' }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.status).toBe('error');
    expect(payload.error_code).toBe('invalid_input');
  });

  it('audits successful test send events', async () => {
    const response = await POST(
      jsonRequest({
        workspace_id: '11111111-1111-1111-1111-111111111111',
        target_id: '22222222-2222-2222-2222-222222222222',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(mocks.logAuditAction).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditAction.mock.calls[0][0]).toMatchObject({
      action: 'delivery.test_sent',
      targetResource: 'delivery_jobs',
    });
  });

  it('supports api_key ingest mode without workspace_id/target_id', async () => {
    const workspaceBuilder = {
      select: vi.fn(() => workspaceBuilder),
      eq: vi.fn(() => workspaceBuilder),
      maybeSingle: vi.fn(async () => ({ data: { id: 'ws_1' }, error: null })),
    };
    const membershipBuilder = {
      select: vi.fn(() => membershipBuilder),
      eq: vi.fn(() => membershipBuilder),
      maybeSingle: vi.fn(async () => ({ data: { workspace_id: 'ws_1' }, error: null })),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_members') return membershipBuilder;
        return membershipBuilder;
      }),
    };
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'workspaces') return workspaceBuilder;
        return workspaceBuilder;
      }),
    };
    mocks.getApiClients.mockResolvedValue({ supabase, admin });

    const response = await POST(jsonRequest({ api_key: 'liq_test_key' }));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ status: 'queued', id: 'evt_1', mode: 'ingest' });
    expect(mocks.processIngestEvent).toHaveBeenCalledTimes(1);
    expect(mocks.requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.enqueueDeliveryJob).not.toHaveBeenCalled();
  });
});
