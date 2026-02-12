-- Migration: SSO Security Hardening & Integrity
-- Description: Enforces global domain uniqueness, adds verification state, protection against SAML replay, and hardens RLS.

-- 1. Safety Check: Fail if duplicate ACTIVE normalized domains exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sso_providers
    WHERE btrim(domain) = ''
  ) THEN
    RAISE EXCEPTION 'Blank SSO domains detected. Domain must be non-empty.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sso_providers
    WHERE enabled IS TRUE
    GROUP BY lower(btrim(domain))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ACTIVE SSO domains detected. Cannot apply unique constraint. Please resolve duplicates first.';
  END IF;
END $$;

-- 2. Enforce Global Domain Uniqueness for ACTIVE providers (Case-Insensitive)
-- Drop legacy unique constraint safely (index-backed, cannot drop index directly).
ALTER TABLE public.sso_providers
  DROP CONSTRAINT IF EXISTS sso_providers_workspace_id_domain_key;

-- Permanent guard: domain must not be blank after trimming.
ALTER TABLE public.sso_providers
  DROP CONSTRAINT IF EXISTS sso_providers_domain_not_blank;

ALTER TABLE public.sso_providers
  ADD CONSTRAINT sso_providers_domain_not_blank
  CHECK (length(btrim(domain)) > 0);

-- Normalize existing rows so ACS lookups remain deterministic with .eq('domain', ...).
UPDATE public.sso_providers
SET domain = lower(btrim(domain));

CREATE UNIQUE INDEX IF NOT EXISTS sso_providers_active_normalized_domain_uidx
  ON public.sso_providers (lower(btrim(domain)))
  WHERE enabled IS TRUE;

-- Normalize domain on every write.
CREATE OR REPLACE FUNCTION public.normalize_sso_provider_domain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.domain := lower(btrim(NEW.domain));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sso_provider_domain ON public.sso_providers;
CREATE TRIGGER trg_normalize_sso_provider_domain
  BEFORE INSERT OR UPDATE OF domain ON public.sso_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_sso_provider_domain();

-- 3. Domain Ownership Verification
ALTER TABLE public.sso_providers
  ADD COLUMN IF NOT EXISTS verification_token TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id);

-- Backfill verification_token for older rows that predate this migration.
UPDATE public.sso_providers
SET verification_token = encode(gen_random_bytes(32), 'hex')
WHERE verification_token IS NULL;

-- Fast lookup and collision guard for verification challenges.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_providers_verification_token
  ON public.sso_providers (verification_token)
  WHERE verification_token IS NOT NULL;

-- Constraints are added NOT VALID for backward compatibility with existing rows.
ALTER TABLE public.sso_providers
  DROP CONSTRAINT IF EXISTS sso_providers_enable_requires_verification;

ALTER TABLE public.sso_providers
  DROP CONSTRAINT IF EXISTS sso_providers_verified_fields_consistent;

ALTER TABLE public.sso_providers
  ADD CONSTRAINT sso_providers_verified_fields_consistent
  CHECK ((verified_at IS NULL) = (verified_by IS NULL))
  NOT VALID;

ALTER TABLE public.sso_providers
  ADD CONSTRAINT sso_providers_enable_requires_verification
  CHECK (
    enabled IS NOT TRUE
    OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
  NOT VALID;

-- 4. SAML Replay Protection
CREATE TABLE IF NOT EXISTS public.saml_replay_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assertion_id TEXT NOT NULL,
  issuer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.saml_replay_cache
  DROP CONSTRAINT IF EXISTS saml_replay_cache_expiry_check;

ALTER TABLE public.saml_replay_cache
  ADD CONSTRAINT saml_replay_cache_expiry_check
  CHECK (expires_at > created_at);

-- Unique index to enforce one-time use per issuer
CREATE UNIQUE INDEX IF NOT EXISTS idx_saml_replay_id_issuer
  ON public.saml_replay_cache (assertion_id, issuer);

-- Index for efficient cleanup of expired assertions
CREATE INDEX IF NOT EXISTS idx_saml_replay_expiry
  ON public.saml_replay_cache (expires_at);

-- Cleanup helper for scheduled jobs.
CREATE OR REPLACE FUNCTION public.cleanup_expired_saml_replay_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM public.saml_replay_cache
  WHERE expires_at <= now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- RLS for Replay Cache (Service Role Only)
ALTER TABLE public.saml_replay_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages replay cache" ON public.saml_replay_cache;
CREATE POLICY "Service role manages replay cache" ON public.saml_replay_cache
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. RLS Hardening: Explicit checks for INSERT and UPDATE
-- Remove broad legacy policy to keep policy set explicit and non-overlapping.
DROP POLICY IF EXISTS "Owners/Admins manage SSO" ON public.sso_providers;
DROP POLICY IF EXISTS "Owners/Admins insert SSO" ON public.sso_providers;
DROP POLICY IF EXISTS "Owners/Admins update SSO" ON public.sso_providers;

CREATE POLICY "Owners/Admins insert SSO" ON public.sso_providers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sso_providers.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins update SSO" ON public.sso_providers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sso_providers.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sso_providers.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));
