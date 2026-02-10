import { NextRequest, NextResponse } from 'next/server';
import { getScimContext, extractScimEmail, extractScimGroups, deriveRoleFromGroups } from '@/lib/scim/utils';

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

export async function GET(request: NextRequest) {
  const ctx = await getScimContext(request.headers.get('authorization'));
  if (!ctx) return scimError(401, 'Unauthorized');

  const { searchParams } = request.nextUrl;
  const startIndex = Number(searchParams.get('startIndex') || '1');
  const count = Math.min(Number(searchParams.get('count') || '50'), 200);
  const offset = Math.max(0, startIndex - 1);

  const { data: mappings, error } = await ctx.admin
    .from('identity_mappings')
    .select('id, external_id, external_email, user_id, scim_attributes')
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider_id', ctx.providerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + count - 1);

  if (error) {
    console.error('SCIM list failed:', error);
    return scimError(500, 'Failed to list users');
  }

  const resources = (mappings || []).map((mapping) => ({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: mapping.external_id,
    userName: mapping.external_email,
    active: true,
    meta: { resourceType: 'User' },
  }));

  return NextResponse.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: resources.length,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getScimContext(request.headers.get('authorization'));
  if (!ctx) return scimError(401, 'Unauthorized');

  const body = await request.json().catch(() => ({}));
  const email = extractScimEmail(body);
  if (!email) return scimError(400, 'Email is required');

  const groups = extractScimGroups(body);
  const role = deriveRoleFromGroups(groups);

  const { data: existingUser, error: lookupError } = await ctx.admin.auth.admin.getUserByEmail(email);
  if (lookupError) {
    console.error('SCIM lookup failed:', lookupError);
    return scimError(500, 'Failed to lookup user');
  }

  let userId = existingUser?.user?.id;
  if (!userId) {
    const { data: created, error: createError } = await ctx.admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createError || !created.user) {
      console.error('SCIM create failed:', createError);
      return scimError(500, 'Failed to create user');
    }
    userId = created.user.id;
  }

  const externalId = body.id || body.externalId || email;

  const { error: mappingError } = await ctx.admin.from('identity_mappings').upsert(
    {
      workspace_id: ctx.workspaceId,
      provider_id: ctx.providerId,
      user_id: userId,
      external_id: externalId,
      external_email: email,
      scim_attributes: body,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'provider_id,external_id' }
  );

  if (mappingError) {
    console.error('SCIM mapping failed:', mappingError);
    return scimError(500, 'Failed to link identity');
  }

  const { error: memberError } = await ctx.admin.from('workspace_members').upsert(
    {
      workspace_id: ctx.workspaceId,
      user_id: userId,
      role,
    },
    { onConflict: 'workspace_id,user_id' }
  );

  if (memberError) {
    console.error('SCIM membership failed:', memberError);
    return scimError(500, 'Failed to create membership');
  }

  return NextResponse.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: externalId,
    userName: email,
    active: true,
    meta: { resourceType: 'User' },
  });
}
