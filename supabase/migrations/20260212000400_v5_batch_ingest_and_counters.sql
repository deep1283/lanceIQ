-- Migration E: Batch Ingest & Counters
-- Description: Batch metadata on events and scale-friendly counters.

-- 1. Ingest Batches (Optional Metadata)
-- Even if we don't fully use it yet, helps normalization
CREATE TABLE IF NOT EXISTS public.ingest_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text CHECK (status IN ('uploading', 'processing', 'completed', 'failed')),
  total_events int,
  processed_events int NOT NULL DEFAULT 0,
  failed_events int NOT NULL DEFAULT 0,
  error_log text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ingest_batches ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_ingest_batches_updated_at ON public.ingest_batches;
CREATE TRIGGER trg_ingest_batches_updated_at
  BEFORE UPDATE ON public.ingest_batches
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- 2. Add Columns to Ingested Events
ALTER TABLE public.ingested_events
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_size int,
  ADD COLUMN IF NOT EXISTS batch_status text,
  ADD COLUMN IF NOT EXISTS batch_received_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ingested_events_batch 
  ON public.ingested_events(batch_id) WHERE batch_id IS NOT NULL;

-- Validate batch metadata (enforced for new rows; existing rows not validated)
ALTER TABLE public.ingested_events
  ADD CONSTRAINT ingested_events_batch_status_check
  CHECK (batch_status IS NULL OR batch_status IN ('uploading', 'processing', 'completed', 'failed'))
  NOT VALID;

ALTER TABLE public.ingested_events
  ADD CONSTRAINT ingested_events_batch_size_check
  CHECK (batch_size IS NULL OR batch_size >= 0)
  NOT VALID;

-- 3. High-Performance Counters
-- Approximate rolling counters for usage (Insert-heavy, infrequent read)
CREATE TABLE IF NOT EXISTS public.workspace_ingest_counters (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  month date NOT NULL, -- First day of month
  event_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (workspace_id, month)
);

ALTER TABLE public.workspace_ingest_counters ENABLE ROW LEVEL SECURITY;

-- 4. Trigger for Counter Increment
CREATE OR REPLACE FUNCTION public.increment_workspace_ingest_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.workspace_ingest_counters (workspace_id, month, event_count)
  VALUES (NEW.workspace_id, date_trunc('month', now())::date, 1)
  ON CONFLICT (workspace_id, month)
  DO UPDATE SET 
    event_count = workspace_ingest_counters.event_count + 1,
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger on ingest
DROP TRIGGER IF EXISTS trg_increment_ingest_counter ON public.ingested_events;
CREATE TRIGGER trg_increment_ingest_counter
  AFTER INSERT ON public.ingested_events
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_workspace_ingest_counter();

-- 5. RLS Policies

DO $$ BEGIN
  -- Batches: Owner/Admin SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view batches' AND tablename = 'ingest_batches') THEN
    CREATE POLICY "Owners/Admins view batches" ON public.ingest_batches
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = ingest_batches.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role: ALL
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages batches' AND tablename = 'ingest_batches') THEN
    CREATE POLICY "Service Role manages batches" ON public.ingest_batches
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- Counters: Owner/Admin SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view counters' AND tablename = 'workspace_ingest_counters') THEN
    CREATE POLICY "Owners/Admins view counters" ON public.workspace_ingest_counters
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = workspace_ingest_counters.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role: ALL (Trigger execution typically runs as owner of function, but helpful for admin tools)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages counters' AND tablename = 'workspace_ingest_counters') THEN
    CREATE POLICY "Service Role manages counters" ON public.workspace_ingest_counters
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
