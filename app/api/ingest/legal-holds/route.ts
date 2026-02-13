import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { canCreateLegalHold, canDeactivateLegalHold } from '@/lib/roles';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';
import { hasWorkspaceEntitlement, teamPlanForbiddenBody } from '@/lib/team-plan-gate';

function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workspaceId = body?.workspace_id as string | undefined;
    const reason = body?.reason as string | undefined;

    if (!workspaceId || !isValidUuid(workspaceId)) {
      return NextResponse.json({ error: 'workspace_id is required.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership || !canCreateLegalHold(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entitled = await hasWorkspaceEntitlement(workspaceId, (entitlements) => entitlements.canUseLegalHold);
    if (!entitled) {
      return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
    }

    const { data: hold, error: insertError } = await supabase
      .from('workspace_legal_holds')
      .insert({
        workspace_id: workspaceId,
        reason: reason || null,
        created_by: user.id,
        active: true,
      })
      .select('id, active, created_at')
      .single();

    if (insertError || !hold) {
      console.error('Create legal hold failed:', insertError);
      return NextResponse.json({ error: 'Failed to create legal hold.' }, { status: 500 });
    }

    await logAuditAction({
      workspaceId: workspaceId,
      action: AUDIT_ACTIONS.LEGAL_HOLD_CREATED,
      actorId: user.id,
      targetResource: 'workspace_legal_holds',
      details: {
        legal_hold_id: hold.id,
        reason: reason || null,
      },
    });

    return NextResponse.json({ id: hold.id, active: hold.active, created_at: hold.created_at });
  } catch (err) {
    console.error('Legal hold create error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const workspaceId = body?.workspace_id as string | undefined;
    const holdId = body?.hold_id as string | undefined;

    if (!workspaceId || !isValidUuid(workspaceId)) {
      return NextResponse.json({ error: 'workspace_id is required.' }, { status: 400 });
    }
    if (!holdId || !isValidUuid(holdId)) {
      return NextResponse.json({ error: 'hold_id is required.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership || !canDeactivateLegalHold(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entitled = await hasWorkspaceEntitlement(workspaceId, (entitlements) => entitlements.canUseLegalHold);
    if (!entitled) {
      return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
    }

    const { data: hold, error: updateError } = await supabase
      .from('workspace_legal_holds')
      .update({ active: false })
      .eq('id', holdId)
      .eq('workspace_id', workspaceId)
      .select('id, active')
      .single();

    if (updateError) {
      console.error('Deactivate legal hold failed:', updateError);
      return NextResponse.json({ error: 'Failed to deactivate legal hold.' }, { status: 500 });
    }
    if (!hold) {
      return NextResponse.json({ error: 'Legal hold not found.' }, { status: 404 });
    }

    await logAuditAction({
      workspaceId: workspaceId,
      action: AUDIT_ACTIONS.LEGAL_HOLD_DEACTIVATED,
      actorId: user.id,
      targetResource: 'workspace_legal_holds',
      details: {
        legal_hold_id: holdId,
      },
    });

    return NextResponse.json({ id: hold.id, active: hold.active });
  } catch (err) {
    console.error('Legal hold deactivate error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
