-- Migration: V6.2 Reconciliation Constraints Patch
-- Description: Hardens V6.2 schema with stricter constraints, normalized snapshot enforcement, 
--             and robust state transition guards.

-- =============================================================================
-- 1. Partial Uniqueness for Active Cases
-- =============================================================================

-- Drop the overly strict UNIQUE constraint (workspace_id, provider, provider_payment_id)
-- Constraint name usually: payment_reconciliation_cases_workspace_id_provider_provider_payme_key
ALTER TABLE public.payment_reconciliation_cases
  DROP CONSTRAINT IF EXISTS payment_reconciliation_cases_workspace_id_provider_provider_payme_key;

-- Add Partial Unique Index for ACTIVE cases only (open/pending)
-- This allows multiple resolved/ignored cases for the same payment in history,
-- but strictly enforces only one ACTIVE case at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_cases_active_unique
  ON public.payment_reconciliation_cases (workspace_id, provider, provider_payment_id)
  WHERE status IN ('open', 'pending');

-- =============================================================================
-- 2. Enforce Normalized Snapshot Contract
-- =============================================================================

-- Safe backfill (jic, though count was 0)
UPDATE public.destination_state_snapshots
SET provider = 'unknown',
    provider_payment_id = 'legacy_unknown',
    downstream_state = 'error',
    observed_at = captured_at -- fallback
WHERE provider IS NULL;

-- Enforce NOT NULL
ALTER TABLE public.destination_state_snapshots
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN provider_payment_id SET NOT NULL,
  ALTER COLUMN downstream_state SET NOT NULL,
  ALTER COLUMN observed_at SET NOT NULL;

-- =============================================================================
-- 3. Snapshot Deduplication Guard
-- =============================================================================

-- Stop identical snapshots from flooding DB
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_dedupe
  ON public.destination_state_snapshots (workspace_id, provider, provider_payment_id, observed_at, state_hash);

-- =============================================================================
-- 4. Harden Case Transition Trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_reconciliation_case_transitions()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check on UPDATE of status
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    
    -- 1. Hard Guard: Invalid Re-open
    -- Once resolved or ignored, cannot go back to open/pending unless strictly mandated?
    -- User requirement: "Prevent invalid reopen paths unless explicitly allowed".
    -- Let's block re-open for now to enforce "New Issue = New Case".
    -- Providing a backdoor for 'ignored' -> 'open' might be useful, but 'resolved' -> 'open' is bad practice.
    IF OLD.status = 'resolved' AND NEW.status IN ('open', 'pending') THEN
       RAISE EXCEPTION 'Cannot re-open a resolved case. Create a new case instead.';
    END IF;

    -- 2. Hard Guard: Resolution Metadata
    IF NEW.status = 'resolved' THEN
       -- Must have actor
       IF NEW.resolved_by IS NULL THEN
          RAISE EXCEPTION 'Resolution requires a valid resolved_by actor.';
       END IF;
       -- Must have note
       IF NEW.resolution_note IS NULL OR length(trim(NEW.resolution_note)) = 0 THEN
          RAISE EXCEPTION 'Resolution requires a non-empty resolution_note.';
       END IF;
       
       -- Auto-set timestamp if null
       IF NEW.resolved_at IS NULL THEN
          NEW.resolved_at := now(); 
       END IF;
    END IF;

    -- 3. Hard Guard: Pending -> Open? (Allowed, likely automated)
    
  END IF;
  return NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-apply trigger (idempotent, effectively replaces)
DROP TRIGGER IF EXISTS trg_reconciliation_case_transitions ON public.payment_reconciliation_cases;
CREATE TRIGGER trg_reconciliation_case_transitions
  BEFORE UPDATE ON public.payment_reconciliation_cases
  FOR EACH ROW EXECUTE FUNCTION public.check_reconciliation_case_transitions();
