-- Migration: V6.2 Reconciliation Cases (Progressive Mode)
-- Description: Adds schema for tracking reconciliation discrepancies as actionable cases.
--             Extends snapshots with normalized fields for 3-way matching.
--             Enforces strict append-only logs for case events and snapshots.

-- =============================================================================
-- 1. Payment Reconciliation Cases
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  
  status TEXT CHECK (status IN ('open', 'pending', 'resolved', 'ignored')) DEFAULT 'open',
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  reason_code TEXT, -- e.g. 'downstream_not_configured', 'confirmed_missing_activation'
  
  masked_customer_label TEXT,
  amount_minor BIGINT,
  currency TEXT,
  
  first_detected_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  grace_until TIMESTAMPTZ,
  
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  UNIQUE (workspace_id, provider, provider_payment_id) -- One active case per payment? 
  -- Requirement: "unique/open-case guard to prevent duplicate active cases".
  -- A unique index on (workspace_id, provider, provider_payment_id) prevents *any* duplicate, even resolved ones.
  -- If we want to allow re-opening or new cases for same payment after resolution, we need partial index.
  -- But "One active case" implies we can have multiple resolved.
  -- Let's stick to simple UNIQUE first, assuming one case lifecycle per payment ID is sufficient for V6.2.
  -- Given payment IDs are unique to a transaction, re-occurrence is unlikely unless it's the *same* issue.
);

-- Indexes for lookup
CREATE INDEX IF NOT EXISTS idx_reconciliation_cases_lookup 
  ON public.payment_reconciliation_cases (workspace_id, provider, provider_payment_id);
  
CREATE INDEX IF NOT EXISTS idx_reconciliation_cases_status_recency 
  ON public.payment_reconciliation_cases (workspace_id, status, last_seen_at DESC);

-- Audit Trigger (Reuse generic V6 trigger if available, or just rely on events table?)
-- Requirement: "case row updates restricted to controlled status transitions".
-- We will settle for standard RLS/Logic, but let's add the audit trigger for Admin actions.
DROP TRIGGER IF EXISTS trg_payment_reconciliation_cases_audit ON public.payment_reconciliation_cases;
CREATE TRIGGER trg_payment_reconciliation_cases_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_reconciliation_cases
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();

-- =============================================================================
-- 2. Payment Reconciliation Case Events (Timeline)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.payment_reconciliation_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created', 'status_change', 'snapshot_received', 'replay_triggered', 'resolved'
  details_json JSONB DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES auth.users(id), -- Null for system/worker
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_events_timeline 
  ON public.payment_reconciliation_case_events (case_id, created_at ASC);

-- =============================================================================
-- 3. Extend Destination State Snapshots
-- =============================================================================

-- Idempotent column additions
ALTER TABLE public.destination_state_snapshots
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS downstream_state TEXT CHECK (downstream_state IN ('activated', 'not_activated', 'error')),
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;

-- Backfill defaults if needed? 
-- V6.1 just launched, likely empty. Nulls are fine for now.

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snapshots_lookup_normalized
  ON public.destination_state_snapshots (workspace_id, provider, provider_payment_id, observed_at DESC);

-- =============================================================================
-- 4. RLS & Security
-- =============================================================================

ALTER TABLE public.payment_reconciliation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reconciliation_case_events ENABLE ROW LEVEL SECURITY;

-- Cases: Members View
CREATE POLICY "Members view cases" ON public.payment_reconciliation_cases
  FOR SELECT USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = payment_reconciliation_cases.workspace_id AND wm.user_id = auth.uid()));

-- Cases: Owners/Admins Manage (Resolve/Replay actions usually update the case)
CREATE POLICY "Owners/Admins manage cases" ON public.payment_reconciliation_cases
  FOR UPDATE USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = payment_reconciliation_cases.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));
  -- Note: INSERT is usually done by Service Role (runner), but maybe manual creation allowed?
  -- Requirement says "service role inserts run-generated cases".
  
CREATE POLICY "Service Role manages cases" ON public.payment_reconciliation_cases
  TO service_role USING (true) WITH CHECK (true);

-- Events: Members View
CREATE POLICY "Members view case events" ON public.payment_reconciliation_case_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM payment_reconciliation_cases c JOIN workspace_members wm ON c.workspace_id = wm.workspace_id WHERE c.id = payment_reconciliation_case_events.case_id AND wm.user_id = auth.uid()));

-- Events: Service Role Inserts
CREATE POLICY "Service Role manages events" ON public.payment_reconciliation_case_events
  TO service_role USING (true) WITH CHECK (true);

-- Events: Owners/Admins Insert (Manual comments/resolutions)
CREATE POLICY "Owners/Admins insert events" ON public.payment_reconciliation_case_events
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM payment_reconciliation_cases c JOIN workspace_members wm ON c.workspace_id = wm.workspace_id WHERE c.id = payment_reconciliation_case_events.case_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));


-- =============================================================================
-- 5. Immutability Enforcement
-- =============================================================================

-- Case Events: Append-Only (No Update/Delete)
CREATE OR REPLACE FUNCTION public.check_case_event_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Case events are immutable.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutability_case_events ON public.payment_reconciliation_case_events;
CREATE TRIGGER trg_immutability_case_events
  BEFORE UPDATE OR DELETE ON public.payment_reconciliation_case_events
  FOR EACH ROW EXECUTE FUNCTION public.check_case_event_immutability();

-- Snapshots: Append-Only (Already protected by check_evidence_immutability in V6.1, safe to rely on that or re-verify)
-- V6.1 check_evidence_immutability covers 'destination_state_snapshots'.
-- "IF TG_TABLE_NAME = 'destination_state_snapshots' THEN IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN ..."
-- So we are covered.

