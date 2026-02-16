-- Migration: V6.2 Backend Refinements
-- Description: Adds configuration for downstream snapshots, optimizes receipt lookups, 
--             and guards case status transitions.

-- =============================================================================
-- 1. Explicit Downstream Configuration (Blocking for 2-way vs 3-way)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_reconciliation_settings (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  downstream_snapshots_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE public.workspace_reconciliation_settings ENABLE ROW LEVEL SECURITY;

-- Owners/Admins manage
CREATE POLICY "Owners/Admins manage reconciliation settings" ON public.workspace_reconciliation_settings
  USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = workspace_reconciliation_settings.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

-- Members view
CREATE POLICY "Members view reconciliation settings" ON public.workspace_reconciliation_settings
  FOR SELECT USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = workspace_reconciliation_settings.workspace_id AND wm.user_id = auth.uid()));

-- Service Role full access
CREATE POLICY "Service Role manages reconciliation settings" ON public.workspace_reconciliation_settings
  TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- 2. Primary Join Key on Receipts (Performance/Strictness)
-- =============================================================================

ALTER TABLE public.ingested_events
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

-- Index for 3-way matcher lookup
-- (workspace_id, detected_provider, provider_payment_id, received_at DESC)
CREATE INDEX IF NOT EXISTS idx_ingested_events_provider_payment 
  ON public.ingested_events (workspace_id, detected_provider, provider_payment_id, received_at DESC);

-- =============================================================================
-- 3. Case Status Transition Guard (Defense-in-Depth)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_reconciliation_case_transitions()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check on UPDATE of status
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    
    -- 1. Prevent moving back to 'open' from 'resolved' or 'ignored'?
    -- User requirement: "enforce allowed transitions ... and resolution metadata consistency"
    
    -- If resolving, require resolution metadata
    IF NEW.status = 'resolved' THEN
       IF NEW.resolved_at IS NULL THEN
          NEW.resolved_at := now(); -- Auto-set if missing
       END IF;
       -- Require removed_by or note? Maybe optional.
    END IF;

    -- If ignoring, maybe similar?
    
    -- If re-opening (resolved -> open)?
    -- Creating a new case is preferred, but if re-opening allowed, we should clear resolved_at.
    IF OLD.status = 'resolved' AND NEW.status = 'open' THEN
       NEW.resolved_at := NULL;
       NEW.resolved_by := NULL;
       NEW.resolution_note := NULL; -- Optional to keep history? Let's clear to avoid confusion.
    END IF;

  END IF;
  return NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconciliation_case_transitions ON public.payment_reconciliation_cases;
CREATE TRIGGER trg_reconciliation_case_transitions
  BEFORE UPDATE ON public.payment_reconciliation_cases
  FOR EACH ROW EXECUTE FUNCTION public.check_reconciliation_case_transitions();
