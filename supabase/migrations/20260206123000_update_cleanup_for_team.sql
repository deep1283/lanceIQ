-- Align cleanup policy with new plan tiers (free / pro / team)
CREATE OR REPLACE FUNCTION public.cleanup_expired_raw_bodies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Free Plan: Delete after 24 hours
  DELETE FROM public.ingested_events
  WHERE 
    received_at < (now() - INTERVAL '24 hours')
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE plan = 'free'
    );

  -- 2. Pro Plan: Delete after 7 days
  DELETE FROM public.ingested_events
  WHERE 
    received_at < (now() - INTERVAL '7 days')
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE plan = 'pro'
    );

  -- 3. Team Plan: Delete after 30 days
  DELETE FROM public.ingested_events
  WHERE 
    received_at < (now() - INTERVAL '30 days')
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE plan = 'team'
    );
END;
$$;
