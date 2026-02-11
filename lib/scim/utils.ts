import crypto from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export type ScimContext = {
  workspaceId: string;
  providerId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
};

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hashScimToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function getScimContext(authorization: string | null): Promise<ScimContext | null> {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const admin = getAdminClient();
  if (!admin) return null;

  const tokenHash = hashScimToken(token);
  const { data: tokenRow, error } = await admin
    .from('scim_tokens')
    .select('id, workspace_id, provider_id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !tokenRow || tokenRow.revoked_at) return null;

  await admin
    .from('scim_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  return {
    workspaceId: tokenRow.workspace_id,
    providerId: tokenRow.provider_id,
    admin,
  };
}

export function extractScimEmail(body: Record<string, any>) {
  if (typeof body.userName === 'string' && body.userName.includes('@')) {
    return body.userName;
  }
  const emails = Array.isArray(body.emails) ? body.emails : [];
  const primary = emails.find((e: any) => e.primary) || emails[0];
  return typeof primary?.value === 'string' ? primary.value : null;
}

export function extractScimGroups(body: Record<string, any>) {
  const groups = Array.isArray(body.groups) ? body.groups : [];
  return groups
    .map((g: any) => g?.display || g?.value)
    .filter((value: any) => typeof value === 'string');
}

export function deriveRoleFromGroups(groups: string[]) {
  const normalized = groups.map((g) => g.toLowerCase());
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('viewer')) return 'viewer';
  if (normalized.includes('exporter')) return 'exporter';
  if (normalized.includes('legal_hold_manager')) return 'legal_hold_manager';
  return 'member';
}
