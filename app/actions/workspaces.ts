'use server';

import { createClient } from '@/utils/supabase/server';
import { generateApiKey } from '@/lib/api-key';
import { revalidatePath } from 'next/cache';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

import { encrypt } from '@/lib/encryption';

export async function createWorkspace(data: {
  name: string;
  provider: string;
  storeRawBody: boolean;
  secret?: string;
}) {
  const name = data.name?.trim();
  if (!name) {
    return { error: 'Workspace name is required.' };
  }
  if (name.length > 120) {
    return { error: 'Workspace name must be 120 characters or fewer.' };
  }
  const allowedProviders = new Set(['stripe', 'razorpay', 'lemon_squeezy', 'generic']);
  if (!allowedProviders.has(data.provider)) {
    return { error: 'Unsupported provider.' };
  }

  const supabase = await createClient();
  const user = await supabase.auth.getUser();

  if (!user.data.user) {
    return { error: 'Unauthorized' };
  }
  const creatorId = user.data.user.id;

  // Generate Secure Key
  // Note: key is the raw key (liq_...), hash is the HMAC-SHA256
  const { key, hash, last4 } = generateApiKey();

  // Encrypt webhook secret if provided
  let encryptedSecret: string | null = null;
  let secretLast4: string | null = null;
  
  if (data.secret && data.secret.length > 0) {
    try {
      encryptedSecret = encrypt(data.secret);
      secretLast4 = data.secret.slice(-4);
    } catch (e) {
      console.error('Encryption Failed:', e);
      return { error: 'Failed to encrypt secret. Check server configuration.' };
    }
  }

  // Create workspace + owner atomically via RPC
  const { data: workspaceId, error: rpcError } = await supabase
    .rpc('create_workspace_with_owner', {
      p_name: name,
      p_provider: data.provider,
      p_api_key_hash: hash,
      p_api_key_last4: last4,
      p_store_raw_body: data.storeRawBody,
      p_raw_body_retention_days: 7,
      p_created_by: creatorId,
      p_encrypted_secret: encryptedSecret,
      p_secret_last4: secretLast4,
    });

  if (rpcError || !workspaceId) {
    console.error('Create Workspace RPC Error:', rpcError);
    return { error: 'Failed to create source. Name might be too long or invalid.' };
  }

  await logAuditAction({
    workspaceId,
    action: AUDIT_ACTIONS.WORKSPACE_CREATED,
    actorId: creatorId,
    targetResource: 'workspaces',
    details: {
      name: name,
      provider: data.provider,
      store_raw_body: data.storeRawBody,
    },
  });

  // Default alert setting (email) - only useful after upgrade
  const defaultEmail = user.data.user.email;
  if (defaultEmail) {
    const { error: alertError } = await supabase
      .from('workspace_alert_settings')
      .insert({
        workspace_id: workspaceId,
        channel: 'email',
        destination: defaultEmail,
        enabled: false,
        critical_fail_count: 3,
        window_minutes: 10,
        cooldown_minutes: 30,
        created_by: creatorId,
      });

    if (alertError) {
      console.error('Create Alert Setting Error:', alertError);
    }
  }

  revalidatePath('/dashboard');
  
  // Return the raw key ONLY here. It is never stored.
  return { success: true, apiKey: key };
}

export async function getWorkspaces() {
  const supabase = await createClient();
  
  // RLS handles visibility (must be a member)
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, provider, api_key_last4, store_raw_body, raw_body_retention_days, created_at, secret_last4')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get Workspaces Error:', error);
    return [];
  }

  return data;
}

export async function deleteWorkspace(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Unauthorized' };
  }
  
  // RLS ensures only owner can delete
  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete Workspace Error:', error);
    return { error: 'Failed to delete source.' };
  }

  await logAuditAction({
    workspaceId: id,
    action: AUDIT_ACTIONS.WORKSPACE_DELETED,
    actorId: user.id,
    targetResource: 'workspaces',
    details: {
      workspace_id: id,
    },
  });

  revalidatePath('/dashboard');
  return { success: true };
}
