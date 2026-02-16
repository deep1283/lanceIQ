import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';

const VALID_STATUS = new Set(['open', 'pending', 'resolved', 'ignored']);

export async function GET(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

  const workspaceId = request.nextUrl.searchParams.get('workspace_id');
  if (!isValidUuid(workspaceId)) {
    const err = apiError('workspace_id is required.', 400, 'invalid_workspace');
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

  const status = request.nextUrl.searchParams.get('status');
  const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 200));

  let query = admin
    .from('payment_reconciliation_cases')
    .select(
      'id, workspace_id, provider, provider_payment_id, status, severity, reason_code, first_detected_at, last_seen_at, grace_until, resolved_at, resolved_by, resolution_note, masked_customer_label, amount_minor, currency'
    )
    .eq('workspace_id', workspaceId)
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (status && VALID_STATUS.has(status)) {
    query = query.eq('status', status);
  }

  const { data: cases, error } = await query;
  if (error) {
    const err = apiError('Failed to load reconciliation cases.', 500, 'cases_fetch_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  return NextResponse.json({
    status: 'ok',
    workspace_id: workspaceId,
    count: (cases || []).length,
    cases: cases || [],
  });
}
