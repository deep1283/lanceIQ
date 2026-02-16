import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { canManageWorkspace } from '@/lib/roles';
import { hasWorkspaceEntitlement, teamPlanForbiddenBody } from '@/lib/team-plan-gate';

export function apiError(message: string, status: number, code: string, id: string | null = null) {
  return {
    body: {
      status: 'error' as const,
      id,
      error: message,
      error_code: code,
    },
    status,
  };
}

export function isValidUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getApiClients() {
  const supabase = await createClient();
  const admin = createAdminClient();
  return { supabase, admin };
}

export async function requireUser(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}

export async function requireWorkspaceAccess(params: {
  supabase: any;
  workspaceId: string;
  userId: string;
  requireManage?: boolean;
  requireTeamPlan?: boolean;
  entitlementPredicate?: (entitlements: any) => boolean;
}) {
  const { supabase, workspaceId, userId } = params;
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    return { ok: false as const, status: 403, body: { error: 'Forbidden' } };
  }

  if (params.requireManage && !canManageWorkspace(membership.role)) {
    return { ok: false as const, status: 403, body: { error: 'Forbidden' } };
  }

  if (params.requireTeamPlan || params.entitlementPredicate) {
    const entitled = await hasWorkspaceEntitlement(workspaceId, params.entitlementPredicate);
    if (!entitled) {
      return { ok: false as const, status: 403, body: teamPlanForbiddenBody() };
    }
  }

  return { ok: true as const, role: membership.role as string | null };
}

export async function requireWorkspaceEntitlementOnly(params: {
  workspaceId: string;
  requireTeamPlan?: boolean;
  entitlementPredicate?: (entitlements: any) => boolean;
}) {
  if (params.requireTeamPlan || params.entitlementPredicate) {
    const entitled = await hasWorkspaceEntitlement(params.workspaceId, params.entitlementPredicate);
    if (!entitled) {
      return { ok: false as const, status: 403, body: teamPlanForbiddenBody() };
    }
  }
  return { ok: true as const };
}

function timingSafeTokenEqual(token: string, expected: string) {
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function extractBearerToken(value: string | null | undefined) {
  const auth = value || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? '';
  return token || null;
}

export function isOpsServiceTokenAuthorized(request: Request) {
  const expectedToken = process.env.OPS_SERVICE_TOKEN || process.env.CRON_SECRET || '';
  if (!expectedToken) return false;
  const providedToken = extractBearerToken(request.headers.get('authorization'));
  if (!providedToken) return false;
  return timingSafeTokenEqual(providedToken, expectedToken);
}

export function canUseForwardingEntitlement(entitlements: any): boolean {
  return Boolean(entitlements?.canUseForwarding);
}

export function canUseReconciliationEntitlement(entitlements: any): boolean {
  return Boolean(entitlements?.canUseReconciliation);
}
