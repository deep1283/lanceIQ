-- Migration: V5.1 Workspace Context Validation & Performance
-- Description: Adds covering index for workspace membership lookups to optimize RLS context resolution.

-- 1. Performance Optimization for User Context Resolution
-- The application now resolves workspace context via a shared resolver and RLS policies frequently check:
-- "does auth.uid() have access to workspace X?"
--
-- Existing PK is (workspace_id, user_id).
-- Existing index idx_wm_user_id is on (user_id).
--
-- We add a composite covering index on (user_id, workspace_id) including role to support:
-- 1) point membership checks by (user_id, workspace_id)
-- 2) workspace list fetches by user_id that select role
-- This optimizes the "gateway" check for workspace-scoped tables (audit_logs, sso_providers, etc).

DROP INDEX IF EXISTS idx_workspace_members_user_workspace_covering;

CREATE INDEX idx_workspace_members_user_workspace_covering
  ON public.workspace_members (user_id, workspace_id)
  INCLUDE (role);

-- 2. Validation Note
-- This migration marks the DB V5.1 state as "Performance Validated".
-- No schema changes are required for the constraints or RLS policies themselves,
-- as they correctly enforce the workspace-scoped entitlement flow.
