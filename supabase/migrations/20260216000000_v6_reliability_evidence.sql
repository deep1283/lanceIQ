-- Migration: V6/V6.1 Reliability, Reconciliation & Evidence
-- Description: Adds schema for reliable webhook delivery, provider integrations, reconciliation audits, and evidence packs.
--             Enforces immutability for evidentiary data and strict RLS for internals.

-- =============================================================================
-- 0. Shared Functions
-- =============================================================================

-- Generic Audit Trigger Function with Redaction
CREATE OR REPLACE FUNCTION public.trigger_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id UUID;
  v_actor_id UUID;
  v_action TEXT;
  v_details JSONB;
  v_old_data JSONB;
  v_new_data JSONB;
  v_redacted_keys TEXT[] := ARRAY['secret', 'secret_encrypted', 'private_key', 'private_key_encrypted', 'credentials_encrypted', 'headers', 'config', 'key_reference'];
  v_key TEXT;
BEGIN
  -- Prepare data
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_new_data := row_to_json(NEW)::jsonb;
    -- Redact sensitive keys
    FOREACH v_key IN ARRAY v_redacted_keys LOOP
      IF v_new_data ? v_key THEN
        v_new_data := jsonb_set(v_new_data, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_data := row_to_json(OLD)::jsonb;
    -- Redact sensitive keys
    FOREACH v_key IN ARRAY v_redacted_keys LOOP
      IF v_old_data ? v_key THEN
        v_old_data := jsonb_set(v_old_data, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
  END IF;

  -- Determine action & details
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_details := v_new_data;
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_details := jsonb_build_object('old', v_old_data, 'new', v_new_data);
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_details := v_old_data;
    v_workspace_id := OLD.workspace_id;
  END IF;

  -- Get current user safely
  v_actor_id := auth.uid();

  -- Insert into audit_logs
  INSERT INTO public.audit_logs (
    workspace_id,
    actor_id,
    action,
    target_resource,
    details,
    created_at
  ) VALUES (
    v_workspace_id,
    v_actor_id,
    TG_TABLE_NAME || '.' || v_action,
    TG_TABLE_NAME,
    v_details,
    now()
  );

  RETURN NULL; -- Return value ignored for AFTER triggers
EXCEPTION WHEN OTHERS THEN
  -- Fail safe: do not block main operation if audit fails, but log warning
  RAISE WARNING 'Audit trigger failed: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 1. Delivery Reliability (Core)
-- =============================================================================

-- 1.1 Workspace Delivery Targets (Config)
CREATE TABLE IF NOT EXISTS public.workspace_delivery_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT, -- Encrypted or simple shared secret
  headers JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT workspace_delivery_targets_url_check CHECK (length(url) > 0)
);

-- Audit trigger for targets
DROP TRIGGER IF EXISTS trg_workspace_delivery_targets_audit ON public.workspace_delivery_targets;
CREATE TRIGGER trg_workspace_delivery_targets_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_delivery_targets
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();

-- 1.2 Workspace Delivery Signing Keys (Security)
CREATE TABLE IF NOT EXISTS public.workspace_delivery_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key_reference TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  public_key TEXT,
  algorithm TEXT DEFAULT 'ed25519',
  state TEXT CHECK (state IN ('active', 'revoked', 'rotating')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

-- Audit trigger for keys
DROP TRIGGER IF EXISTS trg_workspace_delivery_signing_keys_audit ON public.workspace_delivery_signing_keys;
CREATE TRIGGER trg_workspace_delivery_signing_keys_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_delivery_signing_keys
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();

-- 1.3 Delivery Jobs (Unit of Work)
CREATE TABLE IF NOT EXISTS public.delivery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.workspace_delivery_targets(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 1.4 Delivery Breakers (Circuit Breakers)
CREATE TABLE IF NOT EXISTS public.delivery_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_host TEXT NOT NULL,
  state TEXT CHECK (state IN ('closed', 'open', 'half-open')) DEFAULT 'closed',
  failure_count INT DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, target_host)
);

-- Audit trigger for breakers
DROP TRIGGER IF EXISTS trg_delivery_breakers_audit ON public.delivery_breakers;
CREATE TRIGGER trg_delivery_breakers_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_breakers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();

-- 1.5 Delivery Spool (Internal Queue - Sensitive)
CREATE TABLE IF NOT EXISTS public.delivery_spool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  process_after TIMESTAMPTZ DEFAULT now(),
  locked_until TIMESTAMPTZ,
  locked_by TEXT, -- Runner ID
  attempt_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for queue polling
CREATE INDEX IF NOT EXISTS idx_delivery_spool_processing ON public.delivery_spool (process_after, locked_until);

-- 1.6 Delivery Attempts (Evidentiary - Immutable)
CREATE TABLE IF NOT EXISTS public.delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  spool_id UUID, -- Optional reference to spool entry (even if deleted)
  runner_id TEXT,
  response_status INT,
  response_body TEXT,
  response_headers JSONB,
  duration_ms INT,
  success BOOLEAN NOT NULL,
  attempt_number INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 2. Provider Integrations & Objects
-- =============================================================================

-- 2.1 Provider Integrations (Config)
CREATE TABLE IF NOT EXISTS public.provider_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (length(provider_type) > 0),
  config JSONB DEFAULT '{}'::jsonb,
  credentials_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  health_status TEXT CHECK (health_status IN ('healthy', 'degraded', 'unreachable', 'unknown')) DEFAULT 'unknown',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (workspace_id, provider_type)
);

-- Audit trigger for integrations
DROP TRIGGER IF EXISTS trg_provider_integrations_audit ON public.provider_integrations;
CREATE TRIGGER trg_provider_integrations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.provider_integrations
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();

-- 2.2 Provider Objects (References - Privacy Protected)
CREATE TABLE IF NOT EXISTS public.provider_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.provider_integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  summary TEXT, -- PRIVACY WARNING: NO PII ALLOWED IN THIS FIELD
  metadata JSONB DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (integration_id, external_id, object_type)
);

COMMENT ON COLUMN public.provider_objects.summary IS 'Strictly non-PII summary of the external object for display purposes only.';

-- =============================================================================
-- 3. Reconciliation & Evidence Packs
-- =============================================================================

-- 3.1 Reconciliation Runs (Audit)
CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  batch_id UUID, -- For grouping runs
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  items_processed INT DEFAULT 0,
  discrepancies_found INT DEFAULT 0,
  report_json JSONB,
  created_by UUID REFERENCES auth.users(id) -- System or User triggered
);

-- 3.2 Destination State Snapshots (V6.1)
CREATE TABLE IF NOT EXISTS public.destination_state_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.reconciliation_runs(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.workspace_delivery_targets(id),
  object_ref TEXT,
  state_hash TEXT NOT NULL,
  captured_data JSONB,
  captured_at TIMESTAMPTZ DEFAULT now()
);

-- 3.3 Evidence Packs (Bundles - Immutable)
CREATE TABLE IF NOT EXISTS public.evidence_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pack_reference_id TEXT NOT NULL, -- Human readable ref
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('generating', 'sealed', 'archived', 'failed')) DEFAULT 'generating',
  sealed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3.4 Evidence Pack Artifacts
CREATE TABLE IF NOT EXISTS public.evidence_pack_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.evidence_packs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL, -- e.g., 'delivery_log', 'snapshot', 'signature'
  storage_path TEXT NOT NULL,
  file_hash_sha256 TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 4. Security: RLS, Indexes & Immutability
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.workspace_delivery_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_delivery_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_breakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_spool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destination_state_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_pack_artifacts ENABLE ROW LEVEL SECURITY;

-- 4.1 Configuration Tables: Owners/Admins Manage, Members View (if applicable)
-- targets, keys, integrations, breakers

CREATE POLICY "Owners/Admins manage targets" ON public.workspace_delivery_targets
  USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = workspace_delivery_targets.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

CREATE POLICY "Owners/Admins manage keys" ON public.workspace_delivery_signing_keys
  USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = workspace_delivery_signing_keys.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

CREATE POLICY "Owners/Admins manage integrations" ON public.provider_integrations
  USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = provider_integrations.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

CREATE POLICY "Owners/Admins manage breakers" ON public.delivery_breakers
  USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = delivery_breakers.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

-- 4.2 Internal Tables: Service Role Only
-- delivery_spool

CREATE POLICY "Service Role manages spool" ON public.delivery_spool
  TO service_role USING (true) WITH CHECK (true);
-- Users cannot see spool

-- 4.3 Evidentiary/Operational Tables: Read Visibility for Members, No Delete
-- delivery_jobs, delivery_attempts, provider_objects, reconciliation_runs, snapshots, evidence_packs

-- VIEW policies
CREATE POLICY "Members view jobs" ON public.delivery_jobs
  FOR SELECT USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = delivery_jobs.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Members view attempts" ON public.delivery_attempts
  FOR SELECT USING (EXISTS (SELECT 1 FROM delivery_jobs dj JOIN workspace_members wm ON dj.workspace_id = wm.workspace_id WHERE dj.id = delivery_attempts.job_id AND wm.user_id = auth.uid()));

CREATE POLICY "Members view objects" ON public.provider_objects
  FOR SELECT USING (EXISTS (SELECT 1 FROM provider_integrations pi JOIN workspace_members wm ON pi.workspace_id = wm.workspace_id WHERE pi.id = provider_objects.integration_id AND wm.user_id = auth.uid()));

CREATE POLICY "Members view runs" ON public.reconciliation_runs
  FOR SELECT USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = reconciliation_runs.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Members view snapshots" ON public.destination_state_snapshots
  FOR SELECT USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = destination_state_snapshots.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Members view evidence packs" ON public.evidence_packs
  FOR SELECT USING (EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = evidence_packs.workspace_id AND wm.user_id = auth.uid()));

CREATE POLICY "Members view evidence artifacts" ON public.evidence_pack_artifacts
  FOR SELECT USING (EXISTS (SELECT 1 FROM evidence_packs ep JOIN workspace_members wm ON ep.workspace_id = wm.workspace_id WHERE ep.id = evidence_pack_artifacts.pack_id AND wm.user_id = auth.uid()));

-- IMMUTABILITY (No Delete for regular users on specific tables)
-- We strictly do NOT add DELETE policies for these tables for authenticated users.
-- Only Service Role can manage lifecycle if needed (e.g., retention policy).

CREATE POLICY "Service Role manages all" ON public.delivery_jobs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role manages attempts" ON public.delivery_attempts TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role manages objects" ON public.provider_objects TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role manages runs" ON public.reconciliation_runs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role manages snapshots" ON public.destination_state_snapshots TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role manages packs" ON public.evidence_packs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role manages artifacts" ON public.evidence_pack_artifacts TO service_role USING (true) WITH CHECK (true);

-- Indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_workspace_status ON public.delivery_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_attempts_job ON public.delivery_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_provider_objects_integration ON public.provider_objects(integration_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_workspace ON public.reconciliation_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_workspace ON public.evidence_packs(workspace_id);

-- Explicitly revoke DELETE from public on evidentiary tables just in case
REVOKE DELETE ON public.delivery_attempts FROM authenticated;
REVOKE DELETE ON public.evidence_packs FROM authenticated;
REVOKE DELETE ON public.evidence_pack_artifacts FROM authenticated;
REVOKE DELETE ON public.destination_state_snapshots FROM authenticated;
