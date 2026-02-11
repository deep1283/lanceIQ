-- Migration D: Runbook Checks
-- Description: Operational runbooks and execution results.

-- 1. Runbook Checks (Definition)
CREATE TABLE IF NOT EXISTS public.runbook_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL = Global
  check_type text NOT NULL, -- e.g. 'backup_integrity', 'api_latency'
  status text CHECK (status IN ('active', 'disabled', 'deprecated')),
  details jsonb, -- e.g. threshold config
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.runbook_checks ENABLE ROW LEVEL SECURITY;

-- 2. Runbook Results (Execution)
CREATE TABLE IF NOT EXISTS public.runbook_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid REFERENCES public.runbook_checks(id) ON DELETE CASCADE,
  status text CHECK (status IN ('pass', 'fail', 'warning')),
  summary text,
  executed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runbook_results_check_date 
  ON public.runbook_check_results(check_id, executed_at DESC);

ALTER TABLE public.runbook_check_results ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

DO $$ BEGIN
  -- Global Checks: All Members can SELECT (Transparency). Workspace checks: Owners/Admins only.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Members view global checks' AND tablename = 'runbook_checks') THEN
    CREATE POLICY "Members view global checks" ON public.runbook_checks
      FOR SELECT USING (
        (workspace_id IS NULL AND EXISTS (
          SELECT 1 FROM public.workspace_members wm 
          WHERE wm.user_id = auth.uid()
        ))
        OR
        (workspace_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.workspace_members wm 
          WHERE wm.workspace_id = runbook_checks.workspace_id 
          AND wm.user_id = auth.uid()
          AND wm.role IN ('owner', 'admin')
        ))
      );
  END IF;
  
  -- Results: Linked via check_id
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Members view check results_new' AND tablename = 'runbook_check_results') THEN
    CREATE POLICY "Members view check results_new" ON public.runbook_check_results
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.runbook_checks c
                WHERE c.id = runbook_check_results.check_id
                AND (
                  (c.workspace_id IS NULL AND EXISTS (
                    SELECT 1 FROM public.workspace_members wm 
                    WHERE wm.user_id = auth.uid()
                  ))
                  OR
                  EXISTS (SELECT 1 FROM public.workspace_members wm 
                          WHERE wm.workspace_id = c.workspace_id 
                          AND wm.user_id = auth.uid()
                          AND wm.role IN ('owner', 'admin'))
                ))
      );
  END IF;

  -- Service Role: ALL (Runner)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages checks' AND tablename = 'runbook_checks') THEN
    CREATE POLICY "Service Role manages checks" ON public.runbook_checks
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages results' AND tablename = 'runbook_check_results') THEN
    CREATE POLICY "Service Role manages results" ON public.runbook_check_results
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
  
  -- Workspace Checks (Management): Owners/Admins
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins manage workspace checks' AND tablename = 'runbook_checks') THEN
    CREATE POLICY "Owners/Admins manage workspace checks" ON public.runbook_checks
      FOR ALL USING (
        workspace_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = runbook_checks.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        workspace_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = runbook_checks.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;
END $$;
