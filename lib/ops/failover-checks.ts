type ReplicationConfig = {
  id: string;
  workspace_id: string | null;
  region: string;
  mode: string | null;
};

type ReplicationStatus = {
  replication_config_id: string;
  lag_seconds: number | null;
  status: string | null;
  updated_at?: string | null;
};

type RunbookCheck = {
  id: string;
  workspace_id: string | null;
  check_type: string;
  details: Record<string, unknown> | null;
};

type CheckResult = {
  check_id: string;
  status: 'pass' | 'fail' | 'warning';
  summary: string;
};

const DEFAULT_LAG_THRESHOLD_SEC = 60;

function getLagThreshold(details: Record<string, unknown> | null) {
  const raw = details?.lag_threshold_sec;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_LAG_THRESHOLD_SEC;
}

function summarizeReplication(statuses: ReplicationStatus[], threshold: number) {
  if (!statuses.length) {
    return { status: 'warning' as const, summary: 'No replication status available.' };
  }

  const broken = statuses.filter((s) => s.status === 'broken');
  if (broken.length) {
    return { status: 'fail' as const, summary: `Replication broken (${broken.length} regions).` };
  }

  const maxLag = Math.max(...statuses.map((s) => s.lag_seconds ?? 0));
  const lagging = statuses.filter((s) => s.status === 'lagging' || (s.lag_seconds ?? 0) > threshold);
  if (lagging.length) {
    return { status: 'warning' as const, summary: `Replication lagging (max ${maxLag}s).` };
  }

  return { status: 'pass' as const, summary: 'Replication healthy.' };
}

export async function runFailoverChecks(admin: any) {
  const { data: checks, error: checksError } = await admin
    .from('runbook_checks')
    .select('id, workspace_id, check_type, details')
    .eq('status', 'active');

  if (checksError) {
    throw checksError;
  }

  const { data: configs, error: configsError } = await admin
    .from('replication_configs')
    .select('id, workspace_id, region, mode')
    .eq('enabled', true);

  if (configsError) {
    throw configsError;
  }

  const configIds = (configs || []).map((c: ReplicationConfig) => c.id);
  const { data: statusRows, error: statusError } = configIds.length
    ? await admin
        .from('replication_status')
        .select('replication_config_id, lag_seconds, status, updated_at')
        .in('replication_config_id', configIds)
    : { data: [], error: null };

  if (statusError) {
    throw statusError;
  }

  const statusesByConfig = new Map<string, ReplicationStatus>();
  for (const row of statusRows || []) {
    statusesByConfig.set(row.replication_config_id, row);
  }

  const results: CheckResult[] = [];

  for (const check of checks as RunbookCheck[]) {
    if (!check.check_type.startsWith('replication')) {
      results.push({
        check_id: check.id,
        status: 'warning',
        summary: `Check type '${check.check_type}' not implemented.`,
      });
      continue;
    }

    const threshold = getLagThreshold(check.details);
    const relevantConfigs = (configs || []).filter((c: ReplicationConfig) =>
      check.workspace_id ? c.workspace_id === check.workspace_id : true
    );

    const relevantStatuses = relevantConfigs
      .map((config: ReplicationConfig) => statusesByConfig.get(config.id))
      .filter(Boolean) as ReplicationStatus[];

    const { status, summary } = summarizeReplication(relevantStatuses, threshold);
    results.push({ check_id: check.id, status, summary });
  }

  return results;
}
