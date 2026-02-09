export const ROLE = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
  EXPORTER: 'exporter',
  LEGAL_HOLD_MANAGER: 'legal_hold_manager',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export function isOwner(role?: string | null): role is Role {
  return role === ROLE.OWNER;
}

export function isAdmin(role?: string | null): role is Role {
  return role === ROLE.ADMIN;
}

export function isViewer(role?: string | null): role is Role {
  return role === ROLE.VIEWER;
}

export function isExporter(role?: string | null): role is Role {
  return role === ROLE.EXPORTER;
}

export function isLegalHoldManager(role?: string | null): role is Role {
  return role === ROLE.LEGAL_HOLD_MANAGER;
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

export function canExportCertificates(role?: string | null): boolean {
  return role === ROLE.OWNER || role === ROLE.ADMIN || role === ROLE.EXPORTER;
}

export function canCreateLegalHold(role?: string | null): boolean {
  return role === ROLE.OWNER || role === ROLE.LEGAL_HOLD_MANAGER;
}

export function canDeactivateLegalHold(role?: string | null): boolean {
  return role === ROLE.OWNER || role === ROLE.ADMIN;
}
