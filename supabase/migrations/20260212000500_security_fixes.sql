-- =====================================================
-- Migration: Security Fixes
-- Fixes: RLS on webhook_attempts, workspace policy drift,
--        mutable search_path on 9 functions
-- =====================================================

-- 1a. Enable RLS on webhook_attempts (table exists in DB, no prior migration)
ALTER TABLE public.webhook_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role manages webhook_attempts"
  ON public.webhook_attempts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 1b. Fix workspace INSERT policy — scope to authenticated role
-- Note: created_by column does not exist in live DB (repo migration drift)
-- Keeping WITH CHECK (true) but properly scoping to authenticated role
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
CREATE POLICY "Users can create workspaces" ON public.workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 1c. Fix mutable search_path on 9 functions (from DB linter)
-- cleanup_expired_raw_bodies is SECURITY DEFINER (high risk)
-- The other 8 are SECURITY INVOKER (medium risk, still best practice)
ALTER FUNCTION public.cleanup_expired_raw_bodies() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_audit_logs() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_certificates() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_legal_hold_on_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_legal_hold_on_verification_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_team_for_members() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_evidence_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_timestamp_modification() SET search_path = public, pg_temp;

-- 1d. Leaked password protection: Enable in Dashboard
-- Authentication → Settings → Password Security → Enable
