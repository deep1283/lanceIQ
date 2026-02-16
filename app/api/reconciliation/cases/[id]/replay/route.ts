import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { buildForwardingEnvelopeV1 } from '@/lib/delivery/payload';
import { enqueueDeliveryJob, listActiveDeliveryTargets } from '@/lib/delivery/service';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidUuid(id)) {
    const err = apiError('Invalid case id.', 400, 'invalid_case_id');
    return NextResponse.json(err.body, { status: err.status });
  }

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id as string | undefined;
  if (!isValidUuid(workspaceId)) {
    const err = apiError('workspace_id is required.', 400, 'invalid_workspace');
    return NextResponse.json(err.body, { status: err.status });
  }

  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

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

  const { data: caseRow } = await admin
    .from('payment_reconciliation_cases')
    .select('id, workspace_id, provider, provider_payment_id, status')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();

  if (!caseRow?.id) {
    const err = apiError('Reconciliation case not found.', 404, 'case_not_found');
    return NextResponse.json(err.body, { status: err.status });
  }

  const { data: receipt } = await admin
    .from('ingested_events')
    .select('id, workspace_id, detected_provider, provider_payment_id, raw_body, headers')
    .eq('workspace_id', workspaceId)
    .eq('detected_provider', caseRow.provider)
    .eq('provider_payment_id', caseRow.provider_payment_id)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!receipt?.id || typeof receipt.raw_body !== 'string' || !receipt.raw_body.length) {
    const err = apiError(
      'Replay requires retained immutable raw body for this case.',
      409,
      'raw_body_unavailable'
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  const targetsResult = await listActiveDeliveryTargets(admin, workspaceId);
  if (targetsResult.error) {
    const err = apiError('Failed to load delivery targets.', 500, 'targets_fetch_failed');
    return NextResponse.json(err.body, { status: err.status });
  }
  if (!targetsResult.targets.length) {
    const err = apiError('No active delivery targets configured.', 400, 'no_active_targets');
    return NextResponse.json(err.body, { status: err.status });
  }

  const sourceHeaders =
    receipt.headers && typeof receipt.headers === 'object' && !Array.isArray(receipt.headers)
      ? (receipt.headers as Record<string, string>)
      : {};

  const payload = buildForwardingEnvelopeV1({
    rawBody: receipt.raw_body,
    sourceHeaders,
    sourceContentType:
      typeof sourceHeaders['content-type'] === 'string' ? sourceHeaders['content-type'] : 'application/json',
    metadata: {
      ingested_event_id: receipt.id,
      detected_provider: receipt.detected_provider,
      provider_event_id: null,
    },
  });

  const queuedJobs: string[] = [];
  for (const target of targetsResult.targets) {
    const enqueue = await enqueueDeliveryJob({
      admin,
      workspaceId,
      targetId: target.id,
      eventType: `lanceiq.reconciliation.replay.${caseRow.provider}`,
      payload,
      triggerSource: 'reconciliation',
      idempotencyKey: `case_replay:${caseRow.id}:${receipt.id}:${target.id}:${Date.now()}`,
      ingestedEventId: receipt.id,
      createdBy: user.id,
      priority: 9,
    });

    if (enqueue.job?.id) {
      queuedJobs.push(enqueue.job.id);
    }
  }

  await admin.from('payment_reconciliation_case_events').insert({
    case_id: caseRow.id,
    event_type: 'replay_triggered',
    details_json: {
      queued_jobs: queuedJobs,
      queued_count: queuedJobs.length,
      target_count: targetsResult.targets.length,
      ingested_event_id: receipt.id,
    },
    actor_id: user.id,
  });

  await logAuditAction({
    workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.RECONCILIATION_CASE_REPLAY_TRIGGERED,
    targetResource: 'payment_reconciliation_cases',
    details: {
      case_id: caseRow.id,
      provider: caseRow.provider,
      provider_payment_id: caseRow.provider_payment_id,
      queued_jobs: queuedJobs.length,
    },
  });

  return NextResponse.json({
    status: 'ok',
    id: caseRow.id,
    queued_jobs: queuedJobs,
    queued_count: queuedJobs.length,
  });
}
