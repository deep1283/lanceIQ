import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
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
  const resolutionNote = typeof body.resolution_note === 'string' ? body.resolution_note.trim() : '';

  if (!isValidUuid(workspaceId)) {
    const err = apiError('workspace_id is required.', 400, 'invalid_workspace');
    return NextResponse.json(err.body, { status: err.status });
  }
  if (!resolutionNote) {
    const err = apiError('resolution_note is required.', 400, 'invalid_resolution_note');
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
    .select('id, workspace_id, status, provider, provider_payment_id')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();

  if (!caseRow?.id) {
    const err = apiError('Reconciliation case not found.', 404, 'case_not_found');
    return NextResponse.json(err.body, { status: err.status });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from('payment_reconciliation_cases')
    .update({
      status: 'resolved',
      resolved_by: user.id,
      resolved_at: nowIso,
      resolution_note: resolutionNote,
      updated_at: nowIso,
      last_seen_at: nowIso,
    })
    .eq('id', caseRow.id)
    .select('id, status, resolved_at, resolved_by, resolution_note')
    .single();

  if (updateError || !updated?.id) {
    const err = apiError('Failed to resolve case.', 500, 'case_resolve_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  await admin.from('payment_reconciliation_case_events').insert({
    case_id: caseRow.id,
    event_type: 'resolved',
    details_json: {
      previous_status: caseRow.status,
      resolution_note: resolutionNote,
    },
    actor_id: user.id,
  });

  await logAuditAction({
    workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.RECONCILIATION_CASE_RESOLVED,
    targetResource: 'payment_reconciliation_cases',
    details: {
      case_id: caseRow.id,
      provider: caseRow.provider,
      provider_payment_id: caseRow.provider_payment_id,
    },
  });

  return NextResponse.json({
    status: 'ok',
    id: caseRow.id,
    case: updated,
  });
}
