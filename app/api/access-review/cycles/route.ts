import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { canManageWorkspace } from '@/lib/roles';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';
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

  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const entitled = await hasWorkspaceEntitlement(workspaceId, (entitlements) => entitlements.canUseAccessReviews);
  if (!entitled) {
    return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
  }

  const { data, error } = await supabase
    .from('access_review_cycles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Access review fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load access reviews' }, { status: 500 });
  }

  return NextResponse.json({ cycles: data || [] });
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
    .from('access_review_cycles')
    .insert({
      workspace_id: workspaceId,
      reviewer_id: user.id,
      status: body.status || 'pending',
      period_start: body.period_start || null,
      period_end: body.period_end || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Access review create failed:', error);
    return NextResponse.json({ error: 'Failed to create access review' }, { status: 500 });
  }

  await logAuditAction({
    workspaceId,
    action: AUDIT_ACTIONS.ACCESS_REVIEW_CREATED,
    actorId: user.id,
    targetResource: 'access_review_cycles',
    details: { cycle_id: data.id, period_start: data.period_start, period_end: data.period_end },
  });

  return NextResponse.json({ cycle: data });
}
