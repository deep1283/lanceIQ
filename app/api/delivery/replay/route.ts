import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseForwardingEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { enqueueDeliveryJob, getDeliveryTarget, listActiveDeliveryTargets } from '@/lib/delivery/service';
import { buildForwardingEnvelopeV1 } from '@/lib/delivery/payload';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

export async function POST(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id as string | undefined;
  const ingestedEventId = body.ingested_event_id as string | undefined;
  const targetId = body.target_id as string | undefined;

  if (!isValidUuid(workspaceId) || !isValidUuid(ingestedEventId)) {
    const err = apiError('workspace_id and ingested_event_id are required.', 400, 'invalid_input');
    return NextResponse.json(err.body, { status: err.status });
  }
  if (targetId && !isValidUuid(targetId)) {
    const err = apiError('target_id must be a UUID.', 400, 'invalid_target_id');
    return NextResponse.json(err.body, { status: err.status });
  }

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

  const { data: event, error: eventError } = await admin
    .from('ingested_events')
    .select('id, workspace_id, headers, raw_body, detected_provider, provider_event_id')
    .eq('workspace_id', workspaceId)
    .eq('id', ingestedEventId)
    .maybeSingle();

  if (eventError || !event?.id) {
    const err = apiError('Ingested event not found.', 404, 'event_not_found');
    return NextResponse.json(err.body, { status: err.status });
  }
  if (typeof event.raw_body !== 'string' || event.raw_body.length === 0) {
    const err = apiError(
      'Replay requires retained raw body for immutable forwarding.',
      409,
      'raw_body_unavailable'
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  let targets: Array<{ id: string }> = [];
  if (targetId) {
    const target = await getDeliveryTarget(admin, workspaceId, targetId);
    if (!target?.id || !target.is_active) {
      const err = apiError('Active delivery target not found.', 404, 'target_not_found');
      return NextResponse.json(err.body, { status: err.status });
    }
    targets = [{ id: target.id }];
  } else {
    const listed = await listActiveDeliveryTargets(admin, workspaceId);
    if (listed.error) {
      const err = apiError('Failed to load delivery targets.', 500, listed.error);
      return NextResponse.json(err.body, { status: err.status });
    }
    targets = listed.targets.map((item) => ({ id: item.id }));
  }

  if (!targets.length) {
    const err = apiError('No active delivery targets configured.', 400, 'no_active_targets');
    return NextResponse.json(err.body, { status: err.status });
  }

  const eventType = `lanceiq.replay.${event.detected_provider || 'generic'}`;
  const queued: string[] = [];

  for (const target of targets) {
    const idempotencyKey = ['replay', event.id, target.id, event.provider_event_id || 'none'].join(':');
    const sourceHeaders =
      event.headers && typeof event.headers === 'object' && !Array.isArray(event.headers)
        ? (event.headers as Record<string, string>)
        : {};

    const enqueue = await enqueueDeliveryJob({
      admin,
      workspaceId,
      targetId: target.id,
      eventType,
      payload: buildForwardingEnvelopeV1({
        rawBody: event.raw_body,
        sourceHeaders,
        sourceContentType:
          typeof sourceHeaders['content-type'] === 'string'
            ? sourceHeaders['content-type']
            : 'application/json',
        metadata: {
          ingested_event_id: event.id,
          detected_provider: event.detected_provider || 'unknown',
          provider_event_id: event.provider_event_id || null,
        },
      }),
      triggerSource: 'replay',
      idempotencyKey,
      ingestedEventId: event.id,
      createdBy: user.id,
      priority: 8,
    });

    if (enqueue.job?.id) {
      queued.push(enqueue.job.id);
    }
  }

  await logAuditAction({
    workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.DELIVERY_REPLAY_REQUESTED,
    targetResource: 'delivery_jobs',
    details: {
      ingested_event_id: event.id,
      target_count: targets.length,
      queued_count: queued.length,
    },
  });

  return NextResponse.json({
    status: 'ok',
    id: event.id,
    queued_jobs: queued,
  });
}
