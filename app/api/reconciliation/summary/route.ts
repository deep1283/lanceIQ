import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { DOWNSTREAM_UNCONFIGURED_MESSAGE } from '@/lib/delivery/reconciliation';

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
        acc.downstream_not_activated += Number(counters.downstream_not_activated) || 0;
        acc.downstream_error += Number(counters.downstream_error) || 0;
        acc.downstream_unconfigured += Number(counters.downstream_unconfigured) || 0;
        acc.pending_activation += Number(counters.pending_activation) || 0;
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
      downstream_not_activated: 0,
      downstream_error: 0,
      downstream_unconfigured: 0,
      pending_activation: 0,
    }
  );

  const { data: setting } = await admin
    .from('workspace_reconciliation_settings')
    .select('downstream_snapshots_enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const downstreamConfigured = Boolean(setting?.downstream_snapshots_enabled);

  const { data: cases } = await admin
    .from('payment_reconciliation_cases')
    .select('status')
    .eq('workspace_id', workspaceId)
    .limit(5000);

  const caseTotals = (cases || []).reduce(
    (acc, row) => {
      const status = row.status as string | null;
      acc.total += 1;
      if (status === 'open') acc.open += 1;
      if (status === 'pending') acc.pending += 1;
      if (status === 'resolved') acc.resolved += 1;
      if (status === 'ignored') acc.ignored += 1;
      return acc;
    },
    { total: 0, open: 0, pending: 0, resolved: 0, ignored: 0 }
  );

  return NextResponse.json({
    status: 'ok',
    workspace_id: workspaceId,
    coverage_mode: downstreamConfigured ? 'three_way_active' : 'two_way_active',
    downstream_activation_status: downstreamConfigured ? 'configured' : 'downstream_unconfigured',
    downstream_status_message: downstreamConfigured ? null : DOWNSTREAM_UNCONFIGURED_MESSAGE,
    totals,
    cases: caseTotals,
    runs: runs || [],
  });
}
