import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseForwardingEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { runTargetHealthCheck } from '@/lib/delivery/service';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

export async function POST(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id as string | undefined;
  const targetId = body.target_id as string | undefined;
  const manualResume = body.manual_resume === true;

  if (!isValidUuid(workspaceId) || !isValidUuid(targetId)) {
    const err = apiError('workspace_id and target_id are required.', 400, 'invalid_input');
    return NextResponse.json(err.body, { status: err.status });
  }

  const access = await requireWorkspaceAccess({
    supabase,
    workspaceId,
    userId: user.id,
    requireManage: true,
    entitlementPredicate: canUseForwardingEntitlement,
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const result = await runTargetHealthCheck({
    admin,
    workspaceId,
    targetId,
    runnerId: `api:${user.id}`,
    manualResume,
  });

  await logAuditAction({
    workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.DELIVERY_HEALTH_CHECK,
    targetResource: 'delivery_breakers',
    details: { target_id: targetId, manual_resume: manualResume, ok: result.ok, code: result.code },
  });

  if (!result.ok) {
    const err = apiError(
      result.error || 'Delivery health-check failed.',
      400,
      result.code || 'health_check_failed'
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  return NextResponse.json({
    status: 'ok',
    target_id: targetId,
    response_status: result.statusCode,
    breaker_state: result.breaker_state,
  });
}
