'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { canManageWorkspace } from '@/lib/roles';
import { hashScimToken } from '@/lib/scim/utils';

function hasAdminEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function saveSsoProvider(params: {
  workspaceId: string;
  providerId?: string | null;
  domain: string;
  metadataXml?: string | null;
  enabled: boolean;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  const workspaceId = params.workspaceId;
  const domain = params.domain?.trim();
  if (!workspaceId || !domain) {
    return { error: 'Domain is required.' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !canManageWorkspace(membership.role)) {
    return { error: 'You do not have permission to manage SSO.' };
  }

  const payload = {
    workspace_id: workspaceId,
    domain,
    metadata_xml: params.metadataXml?.trim() || null,
    enabled: params.enabled,
  };

  if (params.providerId) {
    const { data, error } = await supabase
      .from('sso_providers')
      .update(payload)
      .eq('id', params.providerId)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error) {
      console.error('SSO provider update failed:', error);
      return { error: 'Failed to update SSO provider.' };
    }

    revalidatePath('/dashboard/settings');
    return { provider: data };
  }

  const { data, error } = await supabase
    .from('sso_providers')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('SSO provider create failed:', error);
    return { error: 'Failed to create SSO provider.' };
  }

  revalidatePath('/dashboard/settings');
  return { provider: data };
}

export async function createScimToken(params: {
  workspaceId: string;
  providerId: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  if (!params.workspaceId || !params.providerId) {
    return { error: 'Workspace and provider are required.' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !canManageWorkspace(membership.role)) {
    return { error: 'You do not have permission to manage SCIM tokens.' };
  }

  if (!hasAdminEnv()) {
    return { error: 'Server configuration error.' };
  }

  const admin = createAdminClient();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashScimToken(token);

  const { data, error } = await admin
    .from('scim_tokens')
    .insert({
      workspace_id: params.workspaceId,
      provider_id: params.providerId,
      token_hash: tokenHash,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('SCIM token creation failed:', error);
    return { error: 'Failed to create SCIM token.' };
  }

  revalidatePath('/dashboard/settings');
  return { token, tokenRecord: data };
}

export async function revokeScimToken(params: {
  workspaceId: string;
  tokenId: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }

  if (!params.workspaceId || !params.tokenId) {
    return { error: 'Workspace and token are required.' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !canManageWorkspace(membership.role)) {
    return { error: 'You do not have permission to manage SCIM tokens.' };
  }

  if (!hasAdminEnv()) {
    return { error: 'Server configuration error.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('scim_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.tokenId)
    .eq('workspace_id', params.workspaceId);

  if (error) {
    console.error('SCIM token revoke failed:', error);
    return { error: 'Failed to revoke SCIM token.' };
  }

  revalidatePath('/dashboard/settings');
  return { success: true };
}
