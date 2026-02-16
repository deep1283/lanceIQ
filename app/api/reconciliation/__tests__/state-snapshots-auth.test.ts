import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApiClients: vi.fn(),
  requireUser: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  requireWorkspaceEntitlementOnly: vi.fn(),
  canUseReconciliationEntitlement: vi.fn(() => true),
  isValidUuid: vi.fn(),
  apiError: vi.fn((message: string, status: number, code: string, id: string | null = null) => ({
    body: { status: 'error', id, error: message, error_code: code },
    status,
  })),
  verifySignedDeliveryRequest: vi.fn(),
  registerDeliveryReplayNonce: vi.fn(),
  decrypt: vi.fn((value: string) => value),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/delivery/api', () => ({
  getApiClients: mocks.getApiClients,
  requireUser: mocks.requireUser,
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
  requireWorkspaceEntitlementOnly: mocks.requireWorkspaceEntitlementOnly,
  canUseReconciliationEntitlement: mocks.canUseReconciliationEntitlement,
  isValidUuid: mocks.isValidUuid,
  apiError: mocks.apiError,
}));

vi.mock('@/lib/delivery/security', () => ({
  verifySignedDeliveryRequest: mocks.verifySignedDeliveryRequest,
  registerDeliveryReplayNonce: mocks.registerDeliveryReplayNonce,
}));

vi.mock('@/lib/encryption', () => ({
  decrypt: mocks.decrypt,
}));

vi.mock('@/utils/audit', () => ({
  AUDIT_ACTIONS: {
    STATE_SNAPSHOT_CREATED: 'reconciliation.state_snapshot_created',
  },
  logAuditAction: mocks.logAuditAction,
}));

import { POST } from '@/app/api/reconciliation/state-snapshots/route';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

function createAdminMock() {
  const runBuilder = {
    select: vi.fn(() => runBuilder),
    eq: vi.fn(() => runBuilder),
    maybeSingle: vi.fn(async () => ({ data: { id: RUN_ID }, error: null })),
  };

  const targetBuilder = {
    select: vi.fn(() => targetBuilder),
    eq: vi.fn(() => targetBuilder),
    maybeSingle: vi.fn(async () => ({ data: { id: TARGET_ID, secret: 'target-secret' }, error: null })),
  };

  const signingBuilder = {
    select: vi.fn(() => signingBuilder),
    eq: vi.fn(() => signingBuilder),
    order: vi.fn(() => signingBuilder),
    limit: vi.fn(() => signingBuilder),
    maybeSingle: vi.fn(async () => ({ data: { secret_encrypted: 'workspace-secret' }, error: null })),
  };

  const snapshotInsert = vi.fn(async () => ({ error: null }));

  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'reconciliation_runs') return runBuilder;
      if (table === 'workspace_delivery_targets') return targetBuilder;
      if (table === 'workspace_delivery_signing_keys') return signingBuilder;
      if (table === 'destination_state_snapshots') return { insert: snapshotInsert };
      return { insert: vi.fn(async () => ({ error: null })) };
    }),
  };

  return { admin, snapshotInsert };
}

function signedRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/reconciliation/state-snapshots', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-lanceiq-signature': 'abcd1234',
      'x-lanceiq-timestamp': `${Math.floor(Date.now() / 1000)}`,
      'x-lanceiq-nonce': 'nonce-1',
    },
    body: JSON.stringify(body),
  });
}

function manualRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/reconciliation/state-snapshots', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/reconciliation/state-snapshots auth modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const { admin } = createAdminMock();
    mocks.getApiClients.mockResolvedValue({ supabase: {}, admin });

    mocks.isValidUuid.mockImplementation(
      (value: string | null | undefined) => Boolean(value) && /^[0-9a-f-]{36}$/i.test(value || '')
    );
    mocks.requireWorkspaceEntitlementOnly.mockResolvedValue({ ok: true });
    mocks.requireWorkspaceAccess.mockResolvedValue({ ok: true, role: 'owner' });
    mocks.requireUser.mockResolvedValue({ id: 'user_1' });
    mocks.verifySignedDeliveryRequest.mockReturnValue({ ok: true });
    mocks.registerDeliveryReplayNonce.mockResolvedValue({ ok: true });
  });

  it('accepts signed callback mode without user session', async () => {
    mocks.requireUser.mockResolvedValue(null);
    const request = signedRequest({
      workspace_id: WORKSPACE_ID,
      run_id: RUN_ID,
      snapshots: [{ target_id: TARGET_ID, state_hash: 'sha256:abc' }],
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: 'ok', run_id: RUN_ID, inserted: 1 });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.requireWorkspaceEntitlementOnly).toHaveBeenCalledTimes(1);
    expect(mocks.verifySignedDeliveryRequest).toHaveBeenCalledTimes(1);
    expect(mocks.registerDeliveryReplayNonce).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditAction.mock.calls[0][0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      actorId: undefined,
      details: { run_id: RUN_ID, count: 1, trigger_mode: 'signed_callback' },
    });
  });

  it('rejects partial signed headers', async () => {
    const request = new Request('http://localhost/api/reconciliation/state-snapshots', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lanceiq-signature': 'abcd1234',
      },
      body: JSON.stringify({
        workspace_id: WORKSPACE_ID,
        run_id: RUN_ID,
        snapshots: [{ target_id: TARGET_ID, state_hash: 'sha256:abc' }],
      }),
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error_code).toBe('missing_signature_headers');
  });

  it('blocks replayed signed callbacks', async () => {
    mocks.registerDeliveryReplayNonce.mockResolvedValue({ ok: false, code: 'replay_detected' });

    const request = signedRequest({
      workspace_id: WORKSPACE_ID,
      run_id: RUN_ID,
      snapshots: [{ target_id: TARGET_ID, state_hash: 'sha256:abc' }],
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error_code).toBe('replay_detected');
  });

  it('keeps manual owner/admin mode working', async () => {
    const request = manualRequest({
      workspace_id: WORKSPACE_ID,
      run_id: RUN_ID,
      snapshots: [{ target_id: TARGET_ID, state_hash: 'sha256:abc' }],
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledTimes(1);
    expect(mocks.verifySignedDeliveryRequest).not.toHaveBeenCalled();
    expect(mocks.logAuditAction.mock.calls[0][0]).toMatchObject({
      actorId: 'user_1',
      details: { trigger_mode: 'manual' },
    });
  });
});
