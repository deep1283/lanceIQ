import { pickPrimaryWorkspace } from '@/lib/workspace';
import type { Role } from '@/lib/roles';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WorkspaceRecord = {
  id: string;
  name: string | null;
  plan: 'free' | 'pro' | 'team' | null;
  subscription_status: string | null;
  raw_body_retention_days: number | null;
  store_raw_body: boolean | null;
  created_at: string | null;
};

type MembershipRow = {
  workspace_id: string;
  role: Role | null;
  workspaces: WorkspaceRecord | WorkspaceRecord[] | null;
};

export type ResolvedWorkspaceContext = {
  workspaceId: string;
  role: Role | null;
  workspace: WorkspaceRecord;
  source: 'hint' | 'cookie' | 'primary';
};

function normalizeWorkspaceRow(row: MembershipRow): WorkspaceRecord | null {
  const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
  if (!workspace?.id) return null;
  return workspace;
}

function isValidWorkspaceId(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

export async function resolveWorkspaceContext(params: {
  supabase: any;
  userId: string;
  workspaceIdHint?: string | null;
  workspaceIdCookie?: string | null;
}): Promise<ResolvedWorkspaceContext | null> {
  const { supabase, userId, workspaceIdHint, workspaceIdCookie } = params;

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select(
      `
      workspace_id,
      role,
      workspaces (
        id,
        name,
        plan,
        subscription_status,
        raw_body_retention_days,
        store_raw_body,
        created_at
      )
    `
    )
    .eq('user_id', userId)
    .limit(50);

  const membershipRows = (memberships || []) as MembershipRow[];
  const normalized: Array<{ workspaceId: string; role: Role | null; workspace: WorkspaceRecord }> = membershipRows
    .map((row) => {
      const workspace = normalizeWorkspaceRow(row);
      if (!workspace) return null;
      return {
        workspaceId: row.workspace_id,
        role: row.role ?? null,
        workspace,
      };
    })
    .filter((row): row is { workspaceId: string; role: Role | null; workspace: WorkspaceRecord } => Boolean(row));

  if (normalized.length === 0) return null;

  const matchById = (id: string) =>
    normalized.find((entry) => entry.workspaceId === id && entry.workspace.id === id) || null;

  if (isValidWorkspaceId(workspaceIdHint)) {
    const hinted = matchById(workspaceIdHint.trim());
    if (hinted) {
      return {
        workspaceId: hinted.workspaceId,
        role: hinted.role,
        workspace: hinted.workspace,
        source: 'hint',
      };
    }
  }

  if (isValidWorkspaceId(workspaceIdCookie)) {
    const fromCookie = matchById(workspaceIdCookie.trim());
    if (fromCookie) {
      return {
        workspaceId: fromCookie.workspaceId,
        role: fromCookie.role,
        workspace: fromCookie.workspace,
        source: 'cookie',
      };
    }
  }

  const primary = pickPrimaryWorkspace(
    normalized.map((entry) => ({
      workspaces: entry.workspace,
    }))
  );

  if (!primary?.id) return null;

  const selected = matchById(primary.id);
  if (!selected) return null;

  return {
    workspaceId: selected.workspaceId,
    role: selected.role,
    workspace: selected.workspace,
    source: 'primary',
  };
}
