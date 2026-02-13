import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { hasWorkspaceEntitlement, teamPlanForbiddenBody } from '@/lib/team-plan-gate';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get('workspace_id');
  if (!workspaceId) {
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

  const entitled = await hasWorkspaceEntitlement(workspaceId);
  if (!entitled) {
    return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
  }

  let checksQuery = supabase
    .from('runbook_checks')
    .select('id, workspace_id, check_type, status, details, created_at')
    .order('created_at', { ascending: false });

  checksQuery = checksQuery.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);

  const { data: checks, error } = await checksQuery;
  if (error) {
    console.error('Runbook checks fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load runbook checks' }, { status: 500 });
  }

  const checkIds = (checks || []).map((c) => c.id);
  const resultsMap = new Map<string, any>();
  if (checkIds.length) {
    const { data: results, error: resultsError } = await supabase
      .from('runbook_check_results')
      .select('check_id, status, summary, executed_at')
      .in('check_id', checkIds)
      .order('executed_at', { ascending: false });

    if (resultsError) {
      console.error('Runbook results fetch failed:', resultsError);
      return NextResponse.json({ error: 'Failed to load runbook results' }, { status: 500 });
    }

    for (const result of results || []) {
      if (!resultsMap.has(result.check_id)) {
        resultsMap.set(result.check_id, result);
      }
    }
  }

  const payload = (checks || []).map((check) => ({
    ...check,
    latest_result: resultsMap.get(check.id) || null,
  }));

  return NextResponse.json({ checks: payload });
}
