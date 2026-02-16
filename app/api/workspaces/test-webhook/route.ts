import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseForwardingEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { hashApiKey } from '@/lib/api-key';
import { processIngestEvent } from '@/lib/ingest-core';
import { enqueueDeliveryJob, runDeliveryJobById } from '@/lib/delivery/service';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

const KEY_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

async function resolveWorkspaceIdForApiKey(admin: any, apiKey: string) {
  let keyHash: string;
  try {
    keyHash = hashApiKey(apiKey);
  } catch {
    return null;
  }

  const { data: workspace } = await admin
    .from('workspaces')
    .select('id')
    .eq('api_key_hash', keyHash)
    .maybeSingle();

  if (workspace?.id) return workspace.id as string;

  const graceCutoff = new Date(Date.now() - KEY_ROTATION_GRACE_MS).toISOString();
  const { data: rotation } = await admin
    .from('api_key_rotations')
    .select('workspace_id, rotated_at')
    .eq('old_key_hash_hint', keyHash)
    .gte('rotated_at', graceCutoff)
    .order('rotated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (rotation?.workspace_id as string | undefined) || null;
}

async function canUserAccessWorkspace(supabase: any, workspaceId: string, userId: string) {
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(membership?.workspace_id);
}

export async function POST(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

  const body = await request.json().catch(() => ({}));
  const workspaceIdInput = body.workspace_id as string | undefined;
  const targetId = body.target_id as string | undefined;
  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : null;

  const hasLegacyDeliveryInput = isValidUuid(workspaceIdInput) && isValidUuid(targetId);
  const hasApiKeyInput = apiKey.length > 0;

  if (!hasLegacyDeliveryInput && !hasApiKeyInput) {
    const err = apiError(
      'Provide either { workspace_id, target_id } or { api_key }.',
      400,
      'invalid_input'
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  if (hasApiKeyInput) {
    const workspaceId = await resolveWorkspaceIdForApiKey(admin, apiKey);
    if (!workspaceId) {
      const err = apiError('Invalid API key.', 401, 'invalid_api_key');
      return NextResponse.json(err.body, { status: err.status });
    }

    const allowed = await canUserAccessWorkspace(supabase, workspaceId, user.id);
    if (!allowed) {
      const err = apiError('Forbidden', 403, 'forbidden');
      return NextResponse.json(err.body, { status: err.status });
    }

    const ingestPayload = payload || {
      event: 'test.ping',
      source: 'workspace_test_webhook',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook from LanceIQ',
      triggered_by: user.id,
    };

    const ingestRequest = new NextRequest('https://lanceiq.internal/api/ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lanceiq-test-event': 'true',
      },
      body: JSON.stringify(ingestPayload),
    });

    const ingestResponse = await processIngestEvent(ingestRequest, apiKey);
    const ingestBody = await ingestResponse.json().catch(() => ({
      status: 'error',
      id: null,
      error: 'Invalid ingest response',
      error_code: 'invalid_response',
    }));

    await logAuditAction({
      workspaceId,
      actorId: user.id,
      action: AUDIT_ACTIONS.DELIVERY_TEST_SENT,
      targetResource: 'ingested_events',
      details: {
        mode: 'api_key_ingest',
        ingest_status: ingestBody?.status ?? null,
        ingest_event_id: ingestBody?.id ?? null,
      },
    });

    return NextResponse.json(
      {
        ...ingestBody,
        mode: 'ingest',
      },
      { status: ingestResponse.status }
    );
  }

  const workspaceId = workspaceIdInput as string;
  const deliveryTargetId = targetId as string;

  const access = await requireWorkspaceAccess({
    supabase,
    workspaceId,
    userId: user.id,
    requireManage: true,
    entitlementPredicate: canUseForwardingEntitlement,
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const eventPayload = payload || {
    type: 'lanceiq.test_webhook',
    message: 'This is a test webhook from LanceIQ.',
    timestamp: new Date().toISOString(),
    triggered_by: user.id,
  };

  const enqueue = await enqueueDeliveryJob({
    admin,
    workspaceId,
    targetId: deliveryTargetId,
    eventType: 'lanceiq.test_webhook',
    payload: eventPayload,
    triggerSource: 'test_webhook',
    idempotencyKey: `test:${workspaceId}:${deliveryTargetId}:${Date.now()}`,
    createdBy: user.id,
    priority: 10,
  });

  if (!enqueue.job?.id) {
    const err = apiError('Failed to enqueue test webhook.', 500, enqueue.error || 'enqueue_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  const result = await runDeliveryJobById({
    admin,
    workspaceId,
    jobId: enqueue.job.id,
    runnerId: `test:${user.id}`,
  });

  await logAuditAction({
    workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.DELIVERY_TEST_SENT,
    targetResource: 'delivery_jobs',
    details: {
      job_id: enqueue.job.id,
      target_id: deliveryTargetId,
      ok: result.ok,
      code: result.code,
    },
  });

  if (!result.ok) {
    const err = apiError(
      'Test webhook failed.',
      result.code === 'target_not_active' ? 400 : 502,
      result.code || 'test_webhook_failed',
      enqueue.job.id
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  return NextResponse.json({
    status: 'ok',
    id: enqueue.job.id,
    target_id: deliveryTargetId,
    response_status: result.result?.statusCode ?? null,
  });
}
