-- Migration: Backend Feedback Fixes (Tier 1)
-- Description: Improves scalability (usage metering), integrity (idempotency), and flexibility (provider enum).

-- 1. Hard Idempotency
-- Rationale: Redis is best-effort. Enterprise requires hard guarantees.
-- Guard against existing duplicates before enforcing uniqueness.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ingested_events
    WHERE provider_event_id IS NOT NULL
    GROUP BY workspace_id, detected_provider, provider_event_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate provider_event_id detected per workspace/provider. Resolve duplicates before applying idx_ingested_events_dedup.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingested_events_dedup
  ON public.ingested_events (workspace_id, detected_provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;


-- 2. Usage Metering Scalability
-- Rationale: COUNT(*) is too slow for hot-path plan gating.
CREATE TABLE IF NOT EXISTS public.workspace_usage_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_start date NOT NULL, -- e.g., '2026-02-01'
  event_count int NOT NULL DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  UNIQUE(workspace_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_lookup
  ON public.workspace_usage_periods(workspace_id, period_start);

ALTER TABLE public.workspace_usage_periods ENABLE ROW LEVEL SECURITY;

-- RLS: Service Role only for writes. Owners/Admins can view.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners view usage' AND tablename = 'workspace_usage_periods') THEN
    CREATE POLICY "Owners view usage" ON public.workspace_usage_periods
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_usage_periods.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;


-- 3. Metering Trigger
CREATE OR REPLACE FUNCTION public.increment_usage_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- Must run as owner to bypass potential RLS on usage table if user context is weak
SET search_path = public, pg_temp
AS $$
DECLARE
  current_period_start date;
BEGIN
  -- Use first day of current month as period
  current_period_start := date_trunc('month', now())::date;

  INSERT INTO public.workspace_usage_periods (workspace_id, period_start, event_count)
  VALUES (NEW.workspace_id, current_period_start, 1)
  ON CONFLICT (workspace_id, period_start)
  DO UPDATE SET 
    event_count = workspace_usage_periods.event_count + 1,
    last_updated = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_usage ON public.ingested_events;
CREATE TRIGGER trg_increment_usage
  AFTER INSERT ON public.ingested_events
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_usage_counter();


-- 4. Provider Enum Flexibility
-- Rationale: Allow 'paypal', 'shopify', or 'unknown' without schema changes.
ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_provider_check;
