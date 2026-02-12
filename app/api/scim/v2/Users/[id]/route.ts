import { NextRequest, NextResponse } from 'next/server';
import { getScimContext, extractScimEmail, deriveRoleFromGroups } from '@/lib/scim/utils';

function scimError(status: number, detail: string) {
  return NextResponse.json(
    {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: String(status),
      detail,
    },
    { status }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getScimContext(request.headers.get('authorization'));
  if (!ctx) return scimError(401, 'Unauthorized');

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const operations = Array.isArray(body.Operations) ? body.Operations : [];

  let active: boolean | null = null;
  let role: string | null = null;
  let email: string | null = null;

  for (const op of operations) {
    const path = (op.path || '').toLowerCase();
    if (path === 'active') {
      active = Boolean(op.value);
    }
    if (path === 'groups') {
      const groups = Array.isArray(op.value) ? op.value.map((g: any) => g.display || g.value) : [];
      role = deriveRoleFromGroups(groups.filter((g: any) => typeof g === 'string'));
    }
  }

  if (body.userName || body.emails) {
    email = extractScimEmail(body);
  }

  const { data: mapping, error: mappingError } = await ctx.admin
    .from('identity_mappings')
    .select('user_id, external_email')
    .eq('provider_id', ctx.providerId)
    .eq('external_id', id)
    .maybeSingle();

  if (mappingError || !mapping) {
    return scimError(404, 'User not found');
  }

  const userId = mapping.user_id;

  if (email && email !== mapping.external_email) {
    const { error: updateError } = await ctx.admin.from('identity_mappings')
      .update({ external_email: email, last_synced_at: new Date().toISOString(), scim_attributes: body })
      .eq('provider_id', ctx.providerId)
      .eq('external_id', id);

    if (updateError) {
      console.error('SCIM email update failed:', updateError);
      return scimError(500, 'Failed to update user');
    }
  }

  if (active === false && userId) {
    await ctx.admin.from('workspace_members').delete().eq('workspace_id', ctx.workspaceId).eq('user_id', userId);
  } else if (userId && role) {
    await ctx.admin.from('workspace_members').update({ role }).eq('workspace_id', ctx.workspaceId).eq('user_id', userId);
  }

  return NextResponse.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id,
    userName: email || mapping.external_email,
    active: active !== false,
    meta: { resourceType: 'User' },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getScimContext(request.headers.get('authorization'));
  if (!ctx) return scimError(401, 'Unauthorized');

  const { id } = await params;

  const { data: mapping, error: mappingError } = await ctx.admin
    .from('identity_mappings')
    .select('user_id')
    .eq('provider_id', ctx.providerId)
    .eq('external_id', id)
    .maybeSingle();

  if (mappingError || !mapping) {
    return scimError(404, 'User not found');
  }

  if (mapping.user_id) {
    await ctx.admin
      .from('workspace_members')
      .delete()
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', mapping.user_id);
  }

  await ctx.admin
    .from('identity_mappings')
    .update({ user_id: null, last_synced_at: new Date().toISOString() })
    .eq('provider_id', ctx.providerId)
    .eq('external_id', id);

  return new NextResponse(null, { status: 204 });
}
