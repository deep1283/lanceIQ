import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { canManageWorkspace } from '@/lib/roles';

const DEFAULT_LAG_THRESHOLD_SEC = 60;

function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

function computeSummary(
  rows: Array<{ status?: string | null; lag_seconds?: number | null; updated_at?: string | null }>
) {
  if (!rows.length) {
    return { overall_status: 'unknown', max_lag_seconds: null, last_updated_at: null };
  }

  const lastUpdated = rows
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  const maxLag = rows.reduce((max, row) => Math.max(max, row.lag_seconds ?? 0), 0);
  const hasBroken = rows.some((row) => row.status === 'broken');
  const hasLagging = rows.some(
    (row) => row.status === 'lagging' || (row.lag_seconds ?? 0) > DEFAULT_LAG_THRESHOLD_SEC
  );

  if (hasBroken) {
    return { overall_status: 'broken', max_lag_seconds: maxLag, last_updated_at: lastUpdated || null };
  }
  if (hasLagging) {
    return { overall_status: 'lagging', max_lag_seconds: maxLag, last_updated_at: lastUpdated || null };
  }
  return { overall_status: 'healthy', max_lag_seconds: maxLag, last_updated_at: lastUpdated || null };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = request.nextUrl.searchParams.get('workspace_id');
  if (!workspaceId || !isValidUuid(workspaceId)) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: configs, error: configError } = await supabase
    .from('replication_configs')
    .select('id, region, mode, enabled, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (configError) {
    console.error('Replication configs fetch failed:', configError);
    return NextResponse.json({ error: 'Failed to load replication configs' }, { status: 500 });
  }

  const configIds = (configs || []).map((config) => config.id);
  const { data: statuses, error: statusError } = configIds.length
    ? await supabase
        .from('replication_status')
        .select('replication_config_id, status, lag_seconds, updated_at, details')
        .in('replication_config_id', configIds)
    : { data: [], error: null };

  if (statusError) {
    console.error('Replication status fetch failed:', statusError);
    return NextResponse.json({ error: 'Failed to load replication status' }, { status: 500 });
  }

  const statusByConfig = new Map<string, any>();
  for (const row of statuses || []) {
    statusByConfig.set(row.replication_config_id, row);
  }

  const regions = (configs || []).map((config) => {
    const status = statusByConfig.get(config.id);
    return {
      config_id: config.id,
      region: config.region,
      mode: config.mode,
      enabled: config.enabled,
      status: status?.status || 'unknown',
      lag_seconds: status?.lag_seconds ?? null,
      updated_at: status?.updated_at ?? null,
      details: status?.details ?? null,
    };
  });

  const summary = computeSummary(regions);

  return NextResponse.json({
    workspace_id: workspaceId,
    summary,
    regions,
  });
}
