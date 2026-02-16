import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const workspaceId = request.nextUrl.searchParams.get('workspace_id');

  if (!isValidUuid(id) || !isValidUuid(workspaceId)) {
    const err = apiError('case id and workspace_id are required.', 400, 'invalid_input');
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
    requireManage: false,
    entitlementPredicate: canUseReconciliationEntitlement,
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { data: caseRow, error: caseError } = await admin
    .from('payment_reconciliation_cases')
    .select(
      'id, workspace_id, provider, provider_payment_id, status, severity, reason_code, first_detected_at, last_seen_at, grace_until, resolved_at, resolved_by, resolution_note, masked_customer_label, amount_minor, currency, created_at, updated_at'
    )
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();

  if (caseError || !caseRow?.id) {
    const err = apiError('Reconciliation case not found.', 404, 'case_not_found');
    return NextResponse.json(err.body, { status: err.status });
  }

  const { data: events, error: eventsError } = await admin
    .from('payment_reconciliation_case_events')
    .select('id, event_type, details_json, actor_id, created_at')
    .eq('case_id', id)
    .order('created_at', { ascending: true });

  if (eventsError) {
    const err = apiError('Failed to load case timeline.', 500, 'case_events_fetch_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  return NextResponse.json({
    status: 'ok',
    workspace_id: workspaceId,
    case: caseRow,
    events: events || [],
  });
}
