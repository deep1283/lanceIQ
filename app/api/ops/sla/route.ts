import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { computeUptime } from '@/lib/sla/compute';

function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get('workspace_id');
  const windowDays = Math.max(1, Number(searchParams.get('window_days') || '30'));

  if (!workspaceId || !isValidUuid(workspaceId)) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const { data: policies, error: policyError } = await supabase
    .from('sla_policies')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (policyError) {
    console.error('SLA policies fetch failed:', policyError);
    return NextResponse.json({ error: 'Failed to load SLA policies' }, { status: 500 });
  }

  const { data: incidents, error: incidentError } = await supabase
    .from('incident_reports')
    .select('started_at, resolved_at, workspace_id')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .gte('started_at', windowStart.toISOString());

  if (incidentError) {
    console.error('Incident fetch failed:', incidentError);
    return NextResponse.json({ error: 'Failed to load incidents' }, { status: 500 });
  }

  const { uptimePercent, downtimeSeconds } = computeUptime({
    incidents: incidents || [],
    windowStart,
    windowEnd,
  });

  return NextResponse.json({
    workspace_id: workspaceId,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    uptime_percent: uptimePercent,
    downtime_seconds: downtimeSeconds,
    policies: policies || [],
  });
}
