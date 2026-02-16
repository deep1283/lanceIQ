import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

  const { id } = await context.params;
  const workspaceId = request.nextUrl.searchParams.get('workspace_id');

  if (!isValidUuid(id) || !isValidUuid(workspaceId)) {
    const err = apiError('Pack id and workspace_id are required.', 400, 'invalid_input');
    return NextResponse.json(err.body, { status: err.status });
  }

  const access = await requireWorkspaceAccess({
    supabase,
    workspaceId,
    userId: user.id,
    requireManage: false,
    entitlementPredicate: canUseReconciliationEntitlement,
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { data: pack, error: packError } = await admin
    .from('evidence_packs')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (packError || !pack?.id) {
    const err = apiError('Evidence pack not found.', 404, 'pack_not_found');
    return NextResponse.json(err.body, { status: err.status });
  }

  const { data: artifacts, error: artifactsError } = await admin
    .from('evidence_pack_artifacts')
    .select('*')
    .eq('pack_id', id)
    .order('created_at', { ascending: true });

  if (artifactsError) {
    const err = apiError('Failed to load evidence artifacts.', 500, 'artifacts_fetch_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  return NextResponse.json({
    status: 'ok',
    pack,
    artifacts: artifacts || [],
  });
}
