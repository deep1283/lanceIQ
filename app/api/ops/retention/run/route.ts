import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { runRetentionJob } from '@/lib/retention/enforce';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-lanceiq-retention-token');
  if (!token || token !== process.env.RETENTION_JOB_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { data: jobs, error } = await admin
    .from('retention_jobs')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(25);

  if (error) {
    console.error('Retention jobs fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load retention jobs' }, { status: 500 });
  }

  const results: any[] = [];
  for (const job of jobs || []) {
    const { data: updated } = await admin
      .from('retention_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job.id)
      .select('id, workspace_id, scope, status')
      .single();

    if (!updated || updated.status === 'aborted_hold') {
      results.push({ job_id: job.id, status: 'aborted_hold' });
      continue;
    }

    const { data: policy } = await admin
      .from('retention_policies')
      .select('retention_days')
      .eq('workspace_id', updated.workspace_id)
      .eq('scope', updated.scope)
      .maybeSingle();

    if (!policy?.retention_days) {
      await admin
        .from('retention_jobs')
        .update({ status: 'failed', error_summary: 'Missing retention policy', completed_at: new Date().toISOString() })
        .eq('id', updated.id);
      results.push({ job_id: updated.id, status: 'failed' });
      continue;
    }

    try {
      const execution = await runRetentionJob(admin, updated, policy.retention_days);
      await admin.from('retention_executions').insert({
        job_id: updated.id,
        workspace_id: updated.workspace_id,
        scope: updated.scope,
        rows_pruned: execution.rows_pruned,
        rows_blocked_by_hold: execution.rows_blocked_by_hold,
        proof_hash: execution.proof_hash,
      });

      await admin
        .from('retention_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', updated.id);

      results.push({ job_id: updated.id, status: 'completed', rows_pruned: execution.rows_pruned });
    } catch (err) {
      console.error('Retention job failed:', err);
      await admin
        .from('retention_jobs')
        .update({ status: 'failed', error_summary: String(err), completed_at: new Date().toISOString() })
        .eq('id', updated.id);
      results.push({ job_id: updated.id, status: 'failed' });
    }
  }

  return NextResponse.json({ results });
}
