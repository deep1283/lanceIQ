import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isOpsServiceTokenAuthorized,
  isValidUuid,
  requireWorkspaceEntitlementOnly,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { runProviderReconciliation } from '@/lib/delivery/reconciliation';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

export async function POST(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const viaServiceToken = isOpsServiceTokenAuthorized(request);

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id as string | undefined;
  const batchId = body.batch_id as string | undefined;

  if (!isValidUuid(workspaceId)) {
    const err = apiError('workspace_id is required.', 400, 'invalid_workspace');
    return NextResponse.json(err.body, { status: err.status });
  }
  if (batchId && !isValidUuid(batchId)) {
    const err = apiError('batch_id must be UUID.', 400, 'invalid_batch_id');
    return NextResponse.json(err.body, { status: err.status });
  }

  let actorId: string | null = null;
  let access:
    | Awaited<ReturnType<typeof requireWorkspaceAccess>>
    | Awaited<ReturnType<typeof requireWorkspaceEntitlementOnly>>;

  if (viaServiceToken) {
    access = await requireWorkspaceEntitlementOnly({
      workspaceId,
      entitlementPredicate: canUseReconciliationEntitlement,
    });
  } else {
    const user = await requireUser(supabase);
    if (!user) {
      const err = apiError('Unauthorized', 401, 'unauthorized');
      return NextResponse.json(err.body, { status: err.status });
    }
    actorId = user.id;
    access = await requireWorkspaceAccess({
      supabase,
      workspaceId,
      userId: user.id,
      requireManage: true,
      entitlementPredicate: canUseReconciliationEntitlement,
    });
  }
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await admin
    .from('reconciliation_runs')
    .insert({
      workspace_id: workspaceId,
      batch_id: batchId || null,
      status: 'running',
      started_at: startedAt,
      created_by: actorId,
    })
    .select('id')
    .single();

  if (runError || !run?.id) {
    const err = apiError('Failed to create reconciliation run.', 500, 'reconciliation_create_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  const reconciliation = await runProviderReconciliation({
    admin,
    workspaceId,
    batchId: batchId || null,
  });
  if (reconciliation.error) {
    await admin
      .from('reconciliation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        report_json: {
          generated_at: new Date().toISOString(),
          error_code: reconciliation.error,
        },
      })
      .eq('id', run.id);

    const err = apiError(
      'Failed to run provider reconciliation.',
      500,
      reconciliation.error,
      run.id
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  const { error: updateError } = await admin
    .from('reconciliation_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_processed: reconciliation.itemsProcessed,
      discrepancies_found: reconciliation.discrepanciesFound,
      report_json: reconciliation.reportJson,
    })
    .eq('id', run.id);

  if (updateError) {
    const err = apiError('Failed to finalize reconciliation run.', 500, 'reconciliation_finalize_failed', run.id);
    return NextResponse.json(err.body, { status: err.status });
  }

  await logAuditAction({
    workspaceId,
    actorId: actorId || undefined,
    action: AUDIT_ACTIONS.RECONCILIATION_RUN_TRIGGERED,
    targetResource: 'reconciliation_runs',
    details: {
      run_id: run.id,
      batch_id: batchId || null,
      items_processed: reconciliation.itemsProcessed,
      discrepancies: reconciliation.discrepanciesFound,
      trigger_mode: viaServiceToken ? 'service_token' : 'manual',
    },
  });

  return NextResponse.json({
    status: 'ok',
    id: run.id,
    items_processed: reconciliation.itemsProcessed,
    discrepancies_found: reconciliation.discrepanciesFound,
    report: reconciliation.reportJson,
  });
}
