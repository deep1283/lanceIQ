import crypto from 'crypto';

const RETENTION_DELETE_LIMIT = 5000;

function hashIds(ids: string[]) {
  if (!ids.length) return null;
  const sorted = [...ids].sort();
  return crypto.createHash('sha256').update(sorted.join(',')).digest('hex');
}

export async function runRetentionJob(admin: any, job: any, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const workspaceId = job.workspace_id;
  const scope = job.scope;

  const result = {
    rows_pruned: 0,
    rows_blocked_by_hold: 0,
    proof_hash: null as string | null,
  };

  if (scope === 'audit_logs') {
    const ids = await selectIds(admin, 'audit_logs', 'created_at', workspaceId, cutoff);
    if (ids.length) {
      await admin.from('audit_logs').delete().in('id', ids);
      result.rows_pruned = ids.length;
      result.proof_hash = hashIds(ids);
    }
    return result;
  }

  if (scope === 'incident_reports') {
    const ids = await selectIds(admin, 'incident_reports', 'created_at', workspaceId, cutoff);
    if (ids.length) {
      await admin.from('incident_reports').delete().in('id', ids);
      result.rows_pruned = ids.length;
      result.proof_hash = hashIds(ids);
    }
    return result;
  }

  if (scope === 'api_key_rotations') {
    const ids = await selectIds(admin, 'api_key_rotations', 'rotated_at', workspaceId, cutoff);
    if (ids.length) {
      await admin.from('api_key_rotations').delete().in('id', ids);
      result.rows_pruned = ids.length;
      result.proof_hash = hashIds(ids);
    }
    return result;
  }

  if (scope === 'identity_mappings') {
    const { data } = await admin
      .from('identity_mappings')
      .select('id')
      .eq('workspace_id', workspaceId)
      .is('user_id', null)
      .lt('last_synced_at', cutoff)
      .limit(RETENTION_DELETE_LIMIT);
    const ids = (data || []).map((row: any) => row.id);
    if (ids.length) {
      await admin.from('identity_mappings').delete().in('id', ids);
      result.rows_pruned = ids.length;
      result.proof_hash = hashIds(ids);
    }
    return result;
  }

  if (scope === 'access_reviews') {
    const { data } = await admin
      .from('access_review_cycles')
      .select('id')
      .eq('workspace_id', workspaceId)
      .lt('created_at', cutoff)
      .limit(RETENTION_DELETE_LIMIT);
    const ids = (data || []).map((row: any) => row.id);
    if (ids.length) {
      await admin.from('access_review_cycles').delete().in('id', ids);
      result.rows_pruned = ids.length;
      result.proof_hash = hashIds(ids);
    }
    return result;
  }

  if (scope === 'events') {
    const { data } = await admin
      .from('ingested_events')
      .select('id')
      .eq('workspace_id', workspaceId)
      .not('raw_body', 'is', null)
      .lt('raw_body_expires_at', new Date().toISOString())
      .limit(RETENTION_DELETE_LIMIT);
    const ids = (data || []).map((row: any) => row.id);
    if (ids.length) {
      await admin.from('ingested_events').update({ raw_body: null }).in('id', ids);
      result.rows_pruned = ids.length;
      result.proof_hash = hashIds(ids);
    }
    return result;
  }

  return result;
}

async function selectIds(
  admin: any,
  table: string,
  dateColumn: string,
  workspaceId: string,
  cutoff: string
) {
  const { data } = await admin
    .from(table)
    .select('id')
    .eq('workspace_id', workspaceId)
    .lt(dateColumn, cutoff)
    .limit(RETENTION_DELETE_LIMIT);
  return (data || []).map((row: any) => row.id);
}
