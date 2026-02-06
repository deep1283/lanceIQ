-- Certificate plan tier + retention
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS plan_tier text CHECK (plan_tier IN ('free', 'pro', 'team')) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill plan tier for existing rows
UPDATE public.certificates
SET plan_tier = CASE
  WHEN is_pro IS TRUE THEN 'pro'
  ELSE 'free'
END
WHERE plan_tier IS NULL;

-- Backfill expires_at for existing rows
UPDATE public.certificates
SET expires_at = CASE
  WHEN plan_tier = 'team' THEN created_at + INTERVAL '3 years'
  WHEN plan_tier = 'pro' THEN created_at + INTERVAL '1 year'
  ELSE created_at + INTERVAL '7 days'
END
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_expires_at
  ON public.certificates(expires_at);

-- Cleanup function for expired certificates
CREATE OR REPLACE FUNCTION public.cleanup_expired_certificates()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM public.certificates
  WHERE expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
