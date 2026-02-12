-- Migration: SSO Domain Normalization & Policy Cleanup Patch
-- Description: Ensures normalization trigger, permanent non-empty constraint, and cleans up legacy policies.
-- Note: This is an idempotent patch. It is safe to run even if the previous migration partially applied these changes.

-- 0. Preflight safety checks for deterministic failures.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sso_providers
    WHERE domain IS NULL OR length(btrim(domain)) = 0
  ) THEN
    RAISE EXCEPTION 'Blank or NULL SSO domains detected. Fix data before applying normalization patch.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sso_providers
    WHERE enabled IS TRUE
    GROUP BY lower(btrim(domain))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Active normalized SSO domain collisions detected. Resolve duplicates before applying patch.';
  END IF;
END $$;

-- 1. Ensure Domain Normalization Trigger
CREATE OR REPLACE FUNCTION public.normalize_sso_provider_domain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Normalize to lowercase and trimmed
  NEW.domain := lower(btrim(NEW.domain));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sso_provider_domain ON public.sso_providers;
CREATE TRIGGER trg_normalize_sso_provider_domain
  BEFORE INSERT OR UPDATE OF domain ON public.sso_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_sso_provider_domain();

-- 2. Backfill Normalization (Safe: existing rows should be normalized by now, but this ensures it)
UPDATE public.sso_providers
SET domain = lower(btrim(domain))
WHERE domain IS DISTINCT FROM lower(btrim(domain));

-- 3. Permanent Non-Empty Domain Constraint
-- Drop first to ensure we can recreate it if the definition changed or just to be sure
ALTER TABLE public.sso_providers
  DROP CONSTRAINT IF EXISTS sso_providers_domain_not_blank;

ALTER TABLE public.sso_providers
  ADD CONSTRAINT sso_providers_domain_not_blank
  CHECK (length(btrim(domain)) > 0);

-- 4. Policy Cleanup
-- Remove broader legacy policy if it exists, to rely solely on the explicit "insert" and "update" policies.
DROP POLICY IF EXISTS "Owners/Admins manage SSO" ON public.sso_providers;
