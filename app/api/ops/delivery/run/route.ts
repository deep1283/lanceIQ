import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseForwardingEntitlement,
  getApiClients,
  isOpsServiceTokenAuthorized,
  isValidUuid,
  requireWorkspaceEntitlementOnly,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { runDeliveryWorker } from '@/lib/delivery/service';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

export async function POST(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const viaServiceToken = isOpsServiceTokenAuthorized(request);

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id as string | undefined;
  const limit = Math.max(1, Math.min(Number(body.limit) || 10, 50));

  if (!isValidUuid(workspaceId)) {
    const err = apiError('workspace_id required', 400, 'invalid_workspace');
    return NextResponse.json(err.body, { status: err.status });
  }

  let actorId: string | null = null;
  let access:
    | Awaited<ReturnType<typeof requireWorkspaceAccess>>
    | Awaited<ReturnType<typeof requireWorkspaceEntitlementOnly>>;

  if (viaServiceToken) {
    access = await requireWorkspaceEntitlementOnly({
      workspaceId,
      entitlementPredicate: canUseForwardingEntitlement,
    });
  } else {
    const user = await requireUser(supabase);
    if (!user) {
      const err = apiError('Unauthorized', 401, 'unauthorized');
      return NextResponse.json(err.body, { status: err.status });
    }
    actorId = user.id;
    access = await requireWorkspaceAccess({
      supabase,
      workspaceId,
      userId: user.id,
      requireManage: true,
      entitlementPredicate: canUseForwardingEntitlement,
    });
  }

  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const result = await runDeliveryWorker({
    admin,
    workspaceId,
    limit,
    runnerId: viaServiceToken ? 'ops:service' : `api:${actorId}`,
  });

  if (result.error) {
    const err = apiError('Failed to run delivery queue.', 500, result.error);
    return NextResponse.json(err.body, { status: err.status });
  }

  await logAuditAction({
    workspaceId,
    actorId: actorId || undefined,
    action: AUDIT_ACTIONS.DELIVERY_RUN_TRIGGERED,
    targetResource: 'delivery_jobs',
    details: {
      processed: result.results.length,
      limit,
      trigger_mode: viaServiceToken ? 'service_token' : 'manual',
    },
  });

  return NextResponse.json({
    status: 'ok',
    processed: result.results.length,
    results: result.results,
  });
}
