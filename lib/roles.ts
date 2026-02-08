export const ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export function isOwner(role?: string | null): role is Role {
  return role === ROLE.OWNER;
}

export function isAdmin(role?: string | null): role is Role {
  return role === ROLE.ADMIN;
}

export function canManageWorkspace(role?: string | null): boolean {
  return role === ROLE.OWNER || role === ROLE.ADMIN;
}

export function canInviteMembers(role?: string | null): boolean {
  return canManageWorkspace(role);
}

export function canRemoveMembers(role?: string | null): boolean {
  return role === ROLE.OWNER;
}

export function canViewAuditLogs(role?: string | null): boolean {
  return canManageWorkspace(role);
}
