export type WorkspaceSummary = {
  id: string;
  plan: string | null;
  created_at: string | null;
};

export type WorkspaceMembershipRow = {
  workspaces: WorkspaceSummary | WorkspaceSummary[] | null;
};

export function pickPrimaryWorkspace(
  memberships: WorkspaceMembershipRow[] | null | undefined
): WorkspaceSummary | null {
  if (!memberships || memberships.length === 0) return null;

  const candidates = memberships
    .map((row) => (Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces))
    .filter((workspace): workspace is WorkspaceSummary => Boolean(workspace));

  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aTeam = a.plan === 'team';
    const bTeam = b.plan === 'team';
    if (aTeam && !bTeam) return -1;
    if (!aTeam && bTeam) return 1;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });

  return sorted[0] ?? null;
}
