import { describe, expect, it } from 'vitest';
import {
  ROLE,
  canCreateLegalHold,
  canDeactivateLegalHold,
  canExportCertificates,
  canInviteMembers,
  canManageWorkspace,
  canRemoveMembers,
  canViewAuditLogs,
  isAdmin,
  isExporter,
  isLegalHoldManager,
  isOwner,
  isViewer,
} from '../roles';

describe('roles', () => {
  it('detects role types', () => {
    expect(isOwner(ROLE.OWNER)).toBe(true);
    expect(isAdmin(ROLE.ADMIN)).toBe(true);
    expect(isViewer(ROLE.VIEWER)).toBe(true);
    expect(isExporter(ROLE.EXPORTER)).toBe(true);
    expect(isLegalHoldManager(ROLE.LEGAL_HOLD_MANAGER)).toBe(true);
    expect(isOwner('member')).toBe(false);
  });

  it('enforces workspace management permissions', () => {
    expect(canManageWorkspace(ROLE.OWNER)).toBe(true);
    expect(canManageWorkspace(ROLE.ADMIN)).toBe(true);
    expect(canManageWorkspace(ROLE.MEMBER)).toBe(false);
    expect(canInviteMembers(ROLE.ADMIN)).toBe(true);
    expect(canRemoveMembers(ROLE.ADMIN)).toBe(false);
    expect(canRemoveMembers(ROLE.OWNER)).toBe(true);
  });

  it('enforces audit and export permissions', () => {
    expect(canViewAuditLogs(ROLE.OWNER)).toBe(true);
    expect(canViewAuditLogs(ROLE.ADMIN)).toBe(true);
    expect(canViewAuditLogs(ROLE.EXPORTER)).toBe(false);

    expect(canExportCertificates(ROLE.OWNER)).toBe(true);
    expect(canExportCertificates(ROLE.ADMIN)).toBe(true);
    expect(canExportCertificates(ROLE.EXPORTER)).toBe(true);
    expect(canExportCertificates(ROLE.MEMBER)).toBe(false);
  });

  it('enforces legal hold permissions', () => {
    expect(canCreateLegalHold(ROLE.OWNER)).toBe(true);
    expect(canCreateLegalHold(ROLE.LEGAL_HOLD_MANAGER)).toBe(true);
    expect(canCreateLegalHold(ROLE.ADMIN)).toBe(false);

    expect(canDeactivateLegalHold(ROLE.OWNER)).toBe(true);
    expect(canDeactivateLegalHold(ROLE.ADMIN)).toBe(true);
    expect(canDeactivateLegalHold(ROLE.LEGAL_HOLD_MANAGER)).toBe(false);
  });
});
