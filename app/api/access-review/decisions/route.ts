import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { canManageWorkspace } from '@/lib/roles';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cycleId = body.cycle_id;
  const targetUserId = body.target_user_id;
  const decision = body.decision;

  if (!cycleId || !targetUserId || !decision) {
    return NextResponse.json({ error: 'cycle_id, target_user_id, decision required' }, { status: 400 });
  }

  const { data: cycle, error: cycleError } = await supabase
    .from('access_review_cycles')
    .select('id, workspace_id')
    .eq('id', cycleId)
    .single();

  if (cycleError || !cycle) {
    return NextResponse.json({ error: 'Access review cycle not found' }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', cycle.workspace_id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('access_review_decisions')
    .insert({
      cycle_id: cycleId,
      target_user_id: targetUserId,
      decision,
      notes: body.notes || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Access review decision failed:', error);
    return NextResponse.json({ error: 'Failed to save decision' }, { status: 500 });
  }

  await logAuditAction({
    workspaceId: cycle.workspace_id,
    action: AUDIT_ACTIONS.ACCESS_REVIEW_DECISION,
    actorId: user.id,
    targetResource: 'access_review_decisions',
    details: { decision_id: data.id, target_user_id: targetUserId, decision },
  });

  return NextResponse.json({ decision: data });
}
