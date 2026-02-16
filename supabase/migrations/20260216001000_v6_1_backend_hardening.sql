-- Migration: V6.1 Backend Hardening & API Support
-- Description: Implements backend requirements for replay protection, HMAC signing, cross-tenant integrity, and evidence verification.

-- =============================================================================
-- 1. Delivery Callback Replay Cache (Hard Blocker)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_callback_replay_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.workspace_delivery_targets(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  request_ts TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_callback_replay_unique 
  ON public.delivery_callback_replay_cache (workspace_id, target_id, nonce);

CREATE INDEX IF NOT EXISTS idx_delivery_callback_replay_expires 
  ON public.delivery_callback_replay_cache (expires_at);

-- RLS: Service Role Only (Write/Select internal use)
ALTER TABLE public.delivery_callback_replay_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role manages replay cache" ON public.delivery_callback_replay_cache
  TO service_role USING (true) WITH CHECK (true);

-- Cleanup Function
CREATE OR REPLACE FUNCTION public.cleanup_expired_callback_replay_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM public.delivery_callback_replay_cache
  WHERE expires_at <= now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- =============================================================================
-- 2. HMAC Signing Key Support
-- =============================================================================

-- Extending existing table to support HMAC
ALTER TABLE public.workspace_delivery_signing_keys
  ADD COLUMN IF NOT EXISTS kid TEXT, -- Key ID for header
  ADD COLUMN IF NOT EXISTS secret_encrypted TEXT, -- For HMAC secrets (distinct from private_key_encrypted if needed, or re-use)
  ALTER COLUMN private_key_encrypted DROP NOT NULL; -- Allow NULL if using secret_encrypted for HMAC

-- Constraints for HMAC
ALTER TABLE public.workspace_delivery_signing_keys
  DROP CONSTRAINT IF EXISTS check_signing_key_type;

ALTER TABLE public.workspace_delivery_signing_keys
  ADD CONSTRAINT check_signing_key_type
  CHECK (
    (algorithm = 'ed25519' AND private_key_encrypted IS NOT NULL) OR
    (algorithm = 'hmac-sha256' AND secret_encrypted IS NOT NULL)
  );

-- Partial unique index for one active primary key per workspace
-- (Assuming we want one active key per algo, or just one active key total? User said "partial unique index for one active primary key")
-- Let's interpret as one active key per algorithm per workspace to allow rotation overlap or dual algo support.
-- Or if "primary key" means *the* key, then just (workspace_id) where state='active'
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_key_per_workspace 
  ON public.workspace_delivery_signing_keys (workspace_id) 
  WHERE state = 'active' AND algorithm = 'hmac-sha256'; -- Assuming we mandate one active HMAC key. 
  -- Note: existing table might have 'active' ed25519. Let's make it per algorithm.
  
DROP INDEX IF EXISTS idx_one_active_key_per_workspace; -- Recreating safer
CREATE UNIQUE INDEX idx_one_active_signing_key_per_algo
  ON public.workspace_delivery_signing_keys (workspace_id, algorithm)
  WHERE state = 'active';

-- =============================================================================
-- 3. Cross-Tenant Integrity Triggers (Hard Blocker)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_cross_tenant_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_workspace_id UUID;
BEGIN
  -- 1. delivery_jobs.target_id -> workspace_id
  IF TG_TABLE_NAME = 'delivery_jobs' AND NEW.target_id IS NOT NULL THEN
    SELECT workspace_id INTO v_parent_workspace_id FROM public.workspace_delivery_targets WHERE id = NEW.target_id;
    IF v_parent_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'Integrity Error: Target % does not belong to workspace %', NEW.target_id, NEW.workspace_id;
    END IF;
  END IF;

  -- 2. destination_state_snapshots.target_id -> workspace_id
  IF TG_TABLE_NAME = 'destination_state_snapshots' AND NEW.target_id IS NOT NULL THEN
    SELECT workspace_id INTO v_parent_workspace_id FROM public.workspace_delivery_targets WHERE id = NEW.target_id;
    IF v_parent_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'Integrity Error: Target % does not belong to workspace %', NEW.target_id, NEW.workspace_id;
    END IF;
    -- Also check run_id
    IF NEW.run_id IS NOT NULL THEN
       SELECT workspace_id INTO v_parent_workspace_id FROM public.reconciliation_runs WHERE id = NEW.run_id;
       IF v_parent_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
         RAISE EXCEPTION 'Integrity Error: Run % does not belong to workspace %', NEW.run_id, NEW.workspace_id;
       END IF;
    END IF;
  END IF;

  -- 3. evidence_pack_artifacts.pack_id (indirect) -> integrity check usually implied by FK but if we have workspace_id on artifacts...
  -- Artifacts table doesn't have workspace_id, it relies on pack_id. So standard FK is fine.
  -- User requested: "validate evidence_pack_artifacts.pack_id belongs to same workspace context."
  -- Since artifacts don't have workspace_id column, we can't cross-check against "NEW.workspace_id".
  -- We trust the path via pack_id.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Triggers
DROP TRIGGER IF EXISTS trg_check_integrity_delivery_jobs ON public.delivery_jobs;
CREATE TRIGGER trg_check_integrity_delivery_jobs
  BEFORE INSERT OR UPDATE ON public.delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

DROP TRIGGER IF EXISTS trg_check_integrity_snapshots ON public.destination_state_snapshots;
CREATE TRIGGER trg_check_integrity_snapshots
  BEFORE INSERT OR UPDATE ON public.destination_state_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.check_cross_tenant_integrity();

-- =============================================================================
-- 4. Idempotency & Provenance on Delivery Jobs
-- =============================================================================

ALTER TABLE public.delivery_jobs
  ADD COLUMN IF NOT EXISTS ingested_event_id UUID, -- FK to ingested_events if exists (keeping soft link or add FK if table exists)
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT CHECK (trigger_source IN ('ingest', 'replay', 'test_webhook', 'reconciliation')),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_jobs_idempotency 
  ON public.delivery_jobs (workspace_id, idempotency_key);

-- =============================================================================
-- 5. Circuit Breaker Enhancements
-- =============================================================================

ALTER TABLE public.delivery_breakers
  ADD COLUMN IF NOT EXISTS consecutive_5xx_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_state_change_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS manual_resume_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_reason TEXT;

-- Atomic state transition function (to be called by workers)
CREATE OR REPLACE FUNCTION public.update_breaker_state(
  p_breaker_id UUID,
  p_new_state TEXT,
  p_reason TEXT DEFAULT NULL,
  p_reset_count BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.delivery_breakers
  SET state = p_new_state,
      opened_reason = COALESCE(p_reason, opened_reason),
      last_state_change_at = now(),
      failure_count = CASE WHEN p_reset_count THEN 0 ELSE failure_count END,
      consecutive_5xx_count = CASE WHEN p_reset_count THEN 0 ELSE consecutive_5xx_count END,
      updated_at = now()
  WHERE id = p_breaker_id;
END;
$$;

-- =============================================================================
-- 6. Evidence Pack Verification Fields
-- =============================================================================

ALTER TABLE public.evidence_packs
  ADD COLUMN IF NOT EXISTS manifest_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS manifest_json JSONB,
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS signature_algorithm TEXT,
  ADD COLUMN IF NOT EXISTS signing_key_id UUID REFERENCES public.workspace_delivery_signing_keys(id),
  ADD COLUMN IF NOT EXISTS verification_status TEXT CHECK (verification_status IN ('unverified', 'verified', 'failed', 'tampered')) DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_details JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_packs_ref_unique 
  ON public.evidence_packs (workspace_id, pack_reference_id);

-- =============================================================================
-- 7. Immutability Enforcement
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_evidence_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow Service Role to bypass (managed via RLS usually, but trigger runs for all)
  -- Effectively matching on rolname or similar if we really want to exempt service role from TRIGGER.
  -- But usually easier to just block UPDATE/DELETE entirely for these states.
  
  -- delivery_attempts: Immutable once created
  IF TG_TABLE_NAME = 'delivery_attempts' THEN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'Delivery attempts are immutable.';
    END IF;
  END IF;

  -- destination_state_snapshots: Immutable
  IF TG_TABLE_NAME = 'destination_state_snapshots' THEN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'Snapshots are immutable.';
    END IF;
  END IF;

  -- evidence_packs: Immutable if sealed
  IF TG_TABLE_NAME = 'evidence_packs' THEN
    IF OLD.status IN ('sealed', 'archived') AND (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status != 'archived')) THEN
       -- Allow transition to archived, but nothing else? Or strictly no changes to fields.
       -- User requirement: "Prevent UPDATE/DELETE ... once status='sealed'"
       IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Sealed evidence packs cannot be deleted.'; END IF;
       IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN -- blocking content updates
          RAISE EXCEPTION 'Sealed evidence packs are immutable.';
       END IF;
    END IF;
  END IF;
  
  -- evidence_pack_artifacts: Immutable if parent pack is sealed? Or just always immutable?
  -- User: "Prevent UPDATE/DELETE on evidence_pack_artifacts"
  IF TG_TABLE_NAME = 'evidence_pack_artifacts' THEN
     IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Evidence artifacts are immutable.';
     END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply Immutability Triggers
CREATE TRIGGER trg_immutability_attempts BEFORE UPDATE OR DELETE ON public.delivery_attempts FOR EACH ROW EXECUTE FUNCTION public.check_evidence_immutability();
CREATE TRIGGER trg_immutability_snapshots BEFORE UPDATE OR DELETE ON public.destination_state_snapshots FOR EACH ROW EXECUTE FUNCTION public.check_evidence_immutability();
CREATE TRIGGER trg_immutability_packs BEFORE UPDATE OR DELETE ON public.evidence_packs FOR EACH ROW EXECUTE FUNCTION public.check_evidence_immutability();
CREATE TRIGGER trg_immutability_artifacts BEFORE UPDATE OR DELETE ON public.evidence_pack_artifacts FOR EACH ROW EXECUTE FUNCTION public.check_evidence_immutability();

-- =============================================================================
-- 8. Spool Worker Functions (RPCs)
-- =============================================================================

-- Atomic Claim
CREATE OR REPLACE FUNCTION public.claim_delivery_spool_work(
  p_runner_id TEXT,
  p_batch_size INT DEFAULT 10
)
RETURNS TABLE (
  spool_id UUID,
  job_id UUID,
  payload JSONB,
  target_url TEXT,
  target_secret TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT ds.id, ds.job_id
    FROM public.delivery_spool ds
    JOIN public.delivery_jobs dj ON ds.job_id = dj.id
    WHERE ds.process_after <= now()
      AND (ds.locked_until IS NULL OR ds.locked_until < now())
    ORDER BY dj.priority DESC, ds.process_after ASC
    LIMIT p_batch_size
    FOR UPDATE OF ds SKIP LOCKED
  )
  UPDATE public.delivery_spool ds
  SET locked_until = now() + interval '1 minute',
      locked_by = p_runner_id,
      attempt_count = ds.attempt_count + 1
  FROM claimed
  JOIN public.delivery_jobs dj ON dj.id = claimed.job_id
  JOIN public.workspace_delivery_targets wdt ON wdt.id = dj.target_id
  WHERE ds.id = claimed.id
  RETURNING ds.id, dj.id, dj.payload, wdt.url, wdt.secret;
END;
$$;

-- =============================================================================
-- 9. API Performance Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_workspace_created ON public.delivery_jobs(workspace_id, status, created_at);
-- delivery_spool index already exists from V6 but checking: (process_after, locked_until)
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_job_created ON public.delivery_attempts(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_workspace_started ON public.reconciliation_runs(workspace_id, started_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_workspace_run ON public.destination_state_snapshots(workspace_id, run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_workspace_created ON public.evidence_packs(workspace_id, created_at);

-- =============================================================================
-- 10. RLS Tightening
-- =============================================================================

-- Owner/Admin manage targets/keys already set in V6. 
-- Delivery Generate? (Jobs INSERT). 
CREATE POLICY "Owners/Admins create jobs" ON public.delivery_jobs
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = delivery_jobs.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

-- Members View Evidence Packs/Runs already set in V6.
-- Exporter role?
CREATE POLICY "Exporters view evidence" ON public.evidence_packs
  FOR SELECT USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = evidence_packs.workspace_id AND wm.user_id = auth.uid() AND wm.role = 'exporter'));

-- Service Role Only enforcement for spool already set.
