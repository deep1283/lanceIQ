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

  // 1. Create Workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      name: name,
      provider: data.provider,
      api_key_hash: hash,
      api_key_last4: last4,
      store_raw_body: data.storeRawBody,
      raw_body_retention_days: 7, // default
      created_by: creatorId,
      encrypted_secret: encryptedSecret,
      secret_last4: secretLast4
    })
    .select('id')
    .single();

  if (wsError) {
    console.error('Create Workspace Error:', wsError);
    return { error: 'Failed to create source. Name might be too long or invalid.' };
  }

  // 2. Add Member (Owner)
  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: creatorId,
      role: 'owner'
    });

  if (memberError) {
    console.error('Add Member Error:', memberError);
    // Cleanup if member add fails? Ideally transaction, but Supabase HTTP doesn't do cross-request transactions easily without RPC.
    // For MVP, if this fails, the workspace exists but is orphaned (RLS prevents anyone from seeing it). 
    // Delete via service role to avoid leaving an orphaned workspace row.
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey) {
        const { createClient: createAdminClient } = await import('@supabase/supabase-js');
        const admin = createAdminClient(supabaseUrl, serviceRoleKey);
        await admin.from('workspaces').delete().eq('id', workspace.id);
      } else {
        await supabase.from('workspaces').delete().eq('id', workspace.id);
      }
    } catch (cleanupErr) {
      console.error('Workspace cleanup failed:', cleanupErr);
    }
    return { error: 'Failed to assign ownership.' };
  }

  await logAuditAction({
    workspaceId: workspace.id,
    action: AUDIT_ACTIONS.WORKSPACE_CREATED,
    actorId: creatorId,
    targetResource: 'workspaces',
    details: {
      name: name,
      provider: data.provider,
      store_raw_body: data.storeRawBody,
    },
  });

  // 3. Default alert setting (email) - only useful after upgrade
  const defaultEmail = user.data.user.email;
  if (defaultEmail) {
    const { error: alertError } = await supabase
      .from('workspace_alert_settings')
      .insert({
        workspace_id: workspace.id,
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
