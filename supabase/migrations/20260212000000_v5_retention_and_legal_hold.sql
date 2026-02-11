-- Migration A: Retention Guarantees & Legal Hold Automation
-- Description: Compliance proof logging and automated hold triggers.

-- 1. Retention Jobs (Schedule)
CREATE TABLE IF NOT EXISTS public.retention_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL, -- e.g. 'audit_logs', 'events'
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  status text CHECK (status IN ('scheduled', 'running', 'completed', 'failed', 'aborted_hold')),
  error_summary text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.retention_jobs ENABLE ROW LEVEL SECURITY;

-- 2. Retention Executions (Proof Log)
CREATE TABLE IF NOT EXISTS public.retention_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.retention_jobs(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL,
  rows_pruned bigint NOT NULL DEFAULT 0,
  rows_blocked_by_hold bigint NOT NULL DEFAULT 0,
  proof_hash text, -- Audit proof (hash of deleted IDs)
  executed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_executions_ws_date 
  ON public.retention_executions(workspace_id, executed_at DESC);

ALTER TABLE public.retention_executions ENABLE ROW LEVEL SECURITY;

-- 3. Legal Hold Automation
CREATE TABLE IF NOT EXISTS public.legal_hold_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rule_type text CHECK (rule_type IN ('user_termination', 'keyword_match', 'manual_api')),
  criteria jsonb, -- e.g. { "user_email": "..." }
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.legal_hold_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.legal_hold_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.legal_hold_automation_rules(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action text CHECK (action IN ('created_hold', 'alerted_legal')),
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.legal_hold_automation_events ENABLE ROW LEVEL SECURITY;

-- 4. Enforcement Trigger
-- Prevents retention jobs from starting/completing if active hold exists
CREATE OR REPLACE FUNCTION public.check_legal_hold_for_retention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only check when starting a job
  IF NEW.status = 'running' THEN
    IF EXISTS (
      SELECT 1 FROM public.workspace_legal_holds
      WHERE workspace_id = NEW.workspace_id
      AND active = true
    ) THEN
      -- Abort the job silently (log it) rather than raising exception that crashes the runner?
      -- Design choice: Update status to aborted immediately.
      NEW.status := 'aborted_hold';
      NEW.completed_at := now();
      NEW.error_summary := 'Aborted due to active Legal Hold';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_legal_hold_retention ON public.retention_jobs;
CREATE TRIGGER trg_check_legal_hold_retention
  BEFORE INSERT OR UPDATE ON public.retention_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'running')
  EXECUTE FUNCTION public.check_legal_hold_for_retention();

-- Prevent retention executions if active hold exists
CREATE OR REPLACE FUNCTION public.block_retention_execution_on_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspace_legal_holds
    WHERE workspace_id = NEW.workspace_id
    AND active = true
  ) THEN
    RAISE EXCEPTION 'Retention execution blocked by active Legal Hold';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_retention_execution ON public.retention_executions;
CREATE TRIGGER trg_block_retention_execution
  BEFORE INSERT ON public.retention_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.block_retention_execution_on_hold();

-- 5. RLS Policies

-- Retention Jobs & Executions
DO $$ BEGIN
  -- Owner/Admin SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view retention' AND tablename = 'retention_jobs') THEN
    CREATE POLICY "Owners/Admins view retention" ON public.retention_jobs
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = retention_jobs.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;
  
  -- Executions (same)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view executions' AND tablename = 'retention_executions') THEN
    CREATE POLICY "Owners/Admins view executions" ON public.retention_executions
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = retention_executions.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role Manages ALL (Job Runner)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages retention jobs' AND tablename = 'retention_jobs') THEN
    CREATE POLICY "Service Role manages retention jobs" ON public.retention_jobs
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages executions' AND tablename = 'retention_executions') THEN
    CREATE POLICY "Service Role manages executions" ON public.retention_executions
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Legal Hold Automation Rules
DO $$ BEGIN
  -- Owner/Admin Manage
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins manage automation' AND tablename = 'legal_hold_automation_rules') THEN
    CREATE POLICY "Owners/Admins manage automation" ON public.legal_hold_automation_rules
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = legal_hold_automation_rules.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = legal_hold_automation_rules.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role Manages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages automation' AND tablename = 'legal_hold_automation_rules') THEN
    CREATE POLICY "Service Role manages automation" ON public.legal_hold_automation_rules
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
  
  -- Events (Audit)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view automation events' AND tablename = 'legal_hold_automation_events') THEN
    CREATE POLICY "Owners/Admins view automation events" ON public.legal_hold_automation_events
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = legal_hold_automation_events.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role inserts events' AND tablename = 'legal_hold_automation_events') THEN
    CREATE POLICY "Service Role inserts events" ON public.legal_hold_automation_events
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
