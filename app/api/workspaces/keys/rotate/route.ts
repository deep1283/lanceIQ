import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { generateApiKey } from '@/lib/api-key';
import { isOwner } from '@/lib/roles';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !isOwner(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('api_key_hash, api_key_last4')
    .eq('id', workspaceId)
    .single();

  if (wsError || !workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const { key, hash, last4 } = generateApiKey();

  const { error: updateError } = await supabase
    .from('workspaces')
    .update({ api_key_hash: hash, api_key_last4: last4 })
    .eq('id', workspaceId);

  if (updateError) {
    console.error('Key rotation failed:', updateError);
    return NextResponse.json({ error: 'Failed to rotate key' }, { status: 500 });
  }

  const admin = getAdminClient();
  if (admin) {
    await admin.from('api_key_rotations').insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      key_type: 'api_key',
      reason: body.reason || null,
      old_key_hash_hint: workspace.api_key_hash,
    });
  }

  await logAuditAction({
    workspaceId,
    action: AUDIT_ACTIONS.KEY_ROTATED,
    actorId: user.id,
    targetResource: 'workspaces',
    details: { reason: body.reason || null },
  });

  return NextResponse.json({
    api_key: key,
    rotated_at: new Date().toISOString(),
  });
}
