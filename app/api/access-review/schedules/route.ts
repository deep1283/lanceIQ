import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { canManageWorkspace } from '@/lib/roles';
import { hasWorkspaceEntitlement, teamPlanForbiddenBody } from '@/lib/team-plan-gate';

function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
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

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const entitled = await hasWorkspaceEntitlement(workspaceId, (entitlements) => entitlements.canUseAccessReviews);
  if (!entitled) {
    return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
  }

  const { data, error } = await supabase
    .from('access_review_schedules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    console.error('Access review schedule fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load schedule' }, { status: 500 });
  }

  return NextResponse.json({ schedule: data || null });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id;
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

  const entitled = await hasWorkspaceEntitlement(workspaceId, (entitlements) => entitlements.canUseAccessReviews);
  if (!entitled) {
    return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
  }

  const { data, error } = await supabase
    .from('access_review_schedules')
    .upsert({
      workspace_id: workspaceId,
      rrule: body.rrule,
      next_run_at: body.next_run_at || null,
      last_run_at: body.last_run_at || null,
      active: body.active !== false,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Access review schedule save failed:', error);
    return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 });
  }

  return NextResponse.json({ schedule: data });
}
