-- Phase 2 add-on: cleanup helper for expired raw bodies
--
-- This function is safe to run repeatedly. It removes `raw_body` once the
-- corresponding `raw_body_expires_at` has passed, keeping the event record and hash.
--
-- Scheduling:
-- - Supabase: enable pg_cron, then schedule `select public.cleanup_expired_raw_bodies();`
-- - Vercel: call /api/cron/cleanup-raw-bodies (recommended for MVP)

CREATE OR REPLACE FUNCTION public.cleanup_expired_raw_bodies()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.ingested_events
  SET raw_body = NULL,
      raw_body_expires_at = NULL
  WHERE raw_body IS NOT NULL
    AND raw_body_expires_at IS NOT NULL
    AND raw_body_expires_at <= now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

