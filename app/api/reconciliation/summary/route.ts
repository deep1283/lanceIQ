import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';

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

  const { data: runs, error } = await admin
    .from('reconciliation_runs')
    .select('id, status, started_at, completed_at, items_processed, discrepancies_found, report_json')
    .eq('workspace_id', workspaceId)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    const err = apiError('Failed to load reconciliation summary.', 500, 'summary_fetch_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  const totals = (runs || []).reduce(
    (acc, run) => {
      acc.items_processed += run.items_processed || 0;
      acc.discrepancies_found += run.discrepancies_found || 0;
      if (run.status === 'failed') acc.failed_runs += 1;
      if (run.status === 'completed') acc.completed_runs += 1;
      const counters = (run.report_json as any)?.discrepancy_counters;
      if (counters && typeof counters === 'object') {
        acc.missing_receipts += Number(counters.missing_receipts) || 0;
        acc.missing_deliveries += Number(counters.missing_deliveries) || 0;
        acc.failed_verifications += Number(counters.failed_verifications) || 0;
        acc.provider_mismatches += Number(counters.provider_mismatches) || 0;
      }
      return acc;
    },
    {
      items_processed: 0,
      discrepancies_found: 0,
      failed_runs: 0,
      completed_runs: 0,
      missing_receipts: 0,
      missing_deliveries: 0,
      failed_verifications: 0,
      provider_mismatches: 0,
    }
  );

  return NextResponse.json({
    status: 'ok',
    workspace_id: workspaceId,
    totals,
    runs: runs || [],
  });
}
