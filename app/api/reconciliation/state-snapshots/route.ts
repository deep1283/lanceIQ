import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/encryption';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireWorkspaceEntitlementOnly,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { registerDeliveryReplayNonce, verifySignedDeliveryRequest } from '@/lib/delivery/security';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

type SnapshotInput = {
  target_id: string;
  provider: string;
  provider_payment_id: string;
  downstream_state: 'activated' | 'not_activated' | 'error';
  observed_at: string;
  object_ref?: string | null;
  state_hash: string;
  reason_code?: string | null;
  captured_data?: Record<string, unknown> | null;
};

type CallbackVerification = {
  ok: true;
  targetId: string;
} | {
  ok: false;
  status: number;
  code: string;
  message: string;
};

function normalizeSnapshots(input: unknown) {
  if (!Array.isArray(input)) return null;
  const out: SnapshotInput[] = [];
  const validStates = new Set(['activated', 'not_activated', 'error']);
  const validProviders = new Set(['stripe', 'razorpay', 'lemon_squeezy']);
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const targetId = typeof row.target_id === 'string' ? row.target_id : '';
    const provider = typeof row.provider === 'string' ? row.provider.trim() : '';
    const providerPaymentId = typeof row.provider_payment_id === 'string' ? row.provider_payment_id.trim() : '';
    const downstreamState =
      typeof row.downstream_state === 'string' ? row.downstream_state.trim().toLowerCase() : '';
    const observedAtRaw = typeof row.observed_at === 'string' ? row.observed_at : '';
    const stateHash = typeof row.state_hash === 'string' ? row.state_hash : '';
    if (!isValidUuid(targetId) || !stateHash || !providerPaymentId) continue;
    if (!validProviders.has(provider) || !validStates.has(downstreamState)) continue;
    const observedAt = new Date(observedAtRaw);
    if (Number.isNaN(observedAt.getTime())) continue;

    out.push({
      target_id: targetId,
      provider,
      provider_payment_id: providerPaymentId,
      downstream_state: downstreamState as SnapshotInput['downstream_state'],
      observed_at: observedAt.toISOString(),
      object_ref: typeof row.object_ref === 'string' ? row.object_ref : null,
      state_hash: stateHash,
      reason_code: typeof row.reason_code === 'string' ? row.reason_code : null,
      captured_data:
        row.captured_data && typeof row.captured_data === 'object' && !Array.isArray(row.captured_data)
          ? (row.captured_data as Record<string, unknown>)
          : null,
    });
  }
  return out;
}

function maybeDecryptSecret(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function pickCallbackTargetId(inputTargetId: string | undefined, snapshots: SnapshotInput[]) {
  const normalizedInput = typeof inputTargetId === 'string' ? inputTargetId.trim() : '';
  if (normalizedInput) {
    if (!isValidUuid(normalizedInput)) {
      return { ok: false as const, code: 'invalid_target', message: 'target_id must be UUID.' };
    }
    const mismatch = snapshots.some((snapshot) => snapshot.target_id !== normalizedInput);
    if (mismatch) {
      return {
        ok: false as const,
        code: 'target_mismatch',
        message: 'All snapshots must match target_id in callback mode.',
      };
    }
    return { ok: true as const, targetId: normalizedInput };
  }

  const ids = Array.from(new Set(snapshots.map((snapshot) => snapshot.target_id)));
  if (ids.length !== 1) {
    return {
      ok: false as const,
      code: 'target_ambiguous',
      message: 'Callback mode requires snapshots for exactly one target_id.',
    };
  }
  return { ok: true as const, targetId: ids[0] };
}

async function verifySignedCallback(params: {
  admin: any;
  bodyRaw: string;
  workspaceId: string;
  targetId: string;
  signature: string;
  timestamp: string;
  nonce: string;
}): Promise<CallbackVerification> {
  const { admin, bodyRaw, workspaceId, targetId, signature, timestamp, nonce } = params;

  const entitlement = await requireWorkspaceEntitlementOnly({
    workspaceId,
    entitlementPredicate: canUseReconciliationEntitlement,
  });
  if (!entitlement.ok) {
    return {
      ok: false,
      status: entitlement.status,
      code: 'not_entitled',
      message: 'Team plan required for this endpoint.',
    };
  }

  const { data: target } = await admin
    .from('workspace_delivery_targets')
    .select('id, secret')
    .eq('workspace_id', workspaceId)
    .eq('id', targetId)
    .maybeSingle();

  if (!target?.id) {
    return {
      ok: false,
      status: 404,
      code: 'target_not_found',
      message: 'Delivery target not found for workspace.',
    };
  }

  const { data: signingKey } = await admin
    .from('workspace_delivery_signing_keys')
    .select('secret_encrypted')
    .eq('workspace_id', workspaceId)
    .eq('algorithm', 'hmac-sha256')
    .eq('state', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const secretCandidates = [
    maybeDecryptSecret(signingKey?.secret_encrypted ?? null),
    maybeDecryptSecret(target?.secret ?? null),
  ].filter((candidate): candidate is string => Boolean(candidate));

  if (secretCandidates.length === 0) {
    return {
      ok: false,
      status: 401,
      code: 'missing_signing_secret',
      message: 'No callback signing secret configured.',
    };
  }

  let staleTimestamp = false;
  let verified = false;
  for (const secret of secretCandidates) {
    const result = verifySignedDeliveryRequest({
      body: bodyRaw,
      secret,
      timestampSec: timestamp,
      nonce,
      signature,
    });
    if (result.ok) {
      verified = true;
      break;
    }
    if (result.code === 'stale_timestamp') {
      staleTimestamp = true;
    }
  }

  if (!verified) {
    return {
      ok: false,
      status: staleTimestamp ? 401 : 403,
      code: staleTimestamp ? 'stale_timestamp' : 'invalid_signature',
      message: staleTimestamp
        ? 'Callback signature timestamp is outside the accepted window.'
        : 'Callback signature verification failed.',
    };
  }

  const replay = await registerDeliveryReplayNonce({
    admin,
    workspaceId,
    targetId,
    nonce,
    timestampSec: timestamp,
  });

  if (!replay.ok) {
    return {
      ok: false,
      status: replay.code === 'replay_detected' ? 409 : replay.code === 'replay_cache_failed' ? 500 : 401,
      code: replay.code,
      message:
        replay.code === 'replay_detected'
          ? 'Replay detected for callback nonce.'
          : replay.code === 'replay_cache_failed'
            ? 'Replay protection cache write failed.'
            : 'Callback timestamp is invalid or stale.',
    };
  }

  return { ok: true, targetId };
}

export async function POST(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const rawBody = await request.text();
  let body: Record<string, unknown> | null = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    const err = apiError('Request body must be valid JSON.', 400, 'invalid_json');
    return NextResponse.json(err.body, { status: err.status });
  }
  const workspaceId = body.workspace_id as string | undefined;
  const runId = body.run_id as string | undefined;
  const callbackTargetId = body.target_id as string | undefined;
  const snapshots = normalizeSnapshots(body.snapshots);

  if (!isValidUuid(workspaceId) || !isValidUuid(runId)) {
    const err = apiError('workspace_id and run_id are required.', 400, 'invalid_input');
    return NextResponse.json(err.body, { status: err.status });
  }
  if (!snapshots || snapshots.length === 0) {
    const err = apiError(
      'snapshots[] must include target_id, provider, provider_payment_id, downstream_state, observed_at, and state_hash.',
      400,
      'invalid_snapshots'
    );
    return NextResponse.json(err.body, { status: err.status });
  }
  const signature = request.headers.get('x-lanceiq-signature')?.trim() || '';
  const timestamp = request.headers.get('x-lanceiq-timestamp')?.trim() || '';
  const nonce = request.headers.get('x-lanceiq-nonce')?.trim() || '';
  const hasSignedHeaders = Boolean(signature || timestamp || nonce);

  let triggerMode: 'manual' | 'signed_callback' = 'manual';
  let actorId: string | undefined;
  if (hasSignedHeaders) {
    if (!signature || !timestamp || !nonce) {
      const err = apiError(
        'Signed callback requires x-lanceiq-signature, x-lanceiq-timestamp, and x-lanceiq-nonce headers.',
        400,
        'missing_signature_headers'
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    const targetPick = pickCallbackTargetId(callbackTargetId, snapshots);
    if (!targetPick.ok) {
      const err = apiError(targetPick.message, 400, targetPick.code);
      return NextResponse.json(err.body, { status: err.status });
    }

    const callbackAuth = await verifySignedCallback({
      admin,
      bodyRaw: rawBody,
      workspaceId,
      targetId: targetPick.targetId,
      signature,
      timestamp,
      nonce,
    });
    if (!callbackAuth.ok) {
      const err = apiError(callbackAuth.message, callbackAuth.status, callbackAuth.code);
      return NextResponse.json(err.body, { status: err.status });
    }
    triggerMode = 'signed_callback';
  } else {
    const user = await requireUser(supabase);
    if (!user) {
      const err = apiError('Unauthorized', 401, 'unauthorized');
      return NextResponse.json(err.body, { status: err.status });
    }
    actorId = user.id;
    const access = await requireWorkspaceAccess({
      supabase,
      workspaceId,
      userId: user.id,
      requireManage: true,
      entitlementPredicate: canUseReconciliationEntitlement,
    });
    if (!access.ok) {
      return NextResponse.json(access.body, { status: access.status });
    }
  }

  const { data: run } = await admin
    .from('reconciliation_runs')
    .select('id')
    .eq('id', runId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!run?.id) {
    const err = apiError('Reconciliation run not found.', 404, 'run_not_found');
    return NextResponse.json(err.body, { status: err.status });
  }

  const dedupe = new Set<string>();
  const payload = snapshots
    .map((snapshot) => ({
    workspace_id: workspaceId,
    run_id: runId,
    target_id: snapshot.target_id,
    provider: snapshot.provider,
    provider_payment_id: snapshot.provider_payment_id,
    downstream_state: snapshot.downstream_state,
    observed_at: snapshot.observed_at,
    object_ref: snapshot.object_ref || null,
    state_hash: snapshot.state_hash,
    reason_code: snapshot.reason_code || null,
    captured_data: snapshot.captured_data || null,
  }))
    .filter((row) => {
      const key = [row.workspace_id, row.provider, row.provider_payment_id, row.observed_at, row.state_hash].join(':');
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });

  const { error } = await admin
    .from('destination_state_snapshots')
    .upsert(payload, {
      onConflict: 'workspace_id,provider,provider_payment_id,observed_at,state_hash',
      ignoreDuplicates: true,
    });
  if (error) {
    const err = apiError('Failed to store snapshots.', 500, 'snapshot_insert_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  await logAuditAction({
    workspaceId,
    actorId,
    action: AUDIT_ACTIONS.STATE_SNAPSHOT_CREATED,
    targetResource: 'destination_state_snapshots',
    details: { run_id: runId, count: payload.length, trigger_mode: triggerMode },
  });

  return NextResponse.json({
    status: 'ok',
    run_id: runId,
    inserted: payload.length,
  });
}
