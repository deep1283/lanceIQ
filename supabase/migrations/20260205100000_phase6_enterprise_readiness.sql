-- Phase 6: Enterprise Readiness (Audit & Ops)

-- 1. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id), -- Nullable if system action (though rarely used here)
  action TEXT NOT NULL, 
  -- Taxonomy: 'workspace.updated', 'member.invited', 'alert.test_sent', 'auth.login', etc.
  target_resource TEXT, -- e.g. 'workspace_members', 'api_key'
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created
  ON audit_logs(workspace_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Alert Deliveries
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_setting_id UUID REFERENCES workspace_alert_settings(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT CHECK (channel IN ('email', 'slack', 'webhook')),
  status TEXT CHECK (status IN ('sent', 'failed', 'retrying')),
  response_payload JSONB,
  attempt_count INT DEFAULT 1,
  next_retry_at TIMESTAMPTZ, -- Null if retries disabled or exhausted
  last_error TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_workspace
  ON alert_deliveries(workspace_id, created_at DESC);

ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Audit Logs: Owner & Admin can SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners and Admins view audit logs' AND tablename = 'audit_logs') THEN
    CREATE POLICY "Owners and Admins view audit logs" ON audit_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM workspace_members wm 
          WHERE wm.workspace_id = audit_logs.workspace_id 
          AND wm.user_id = auth.uid()
          AND wm.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;
-- NOTE: No INSERT policy for client (Service Role only)

-- Alert Deliveries: Owner & Admin can SELECT (operational visibility)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners and Admins view alert deliveries' AND tablename = 'alert_deliveries') THEN
    CREATE POLICY "Owners and Admins view alert deliveries" ON alert_deliveries
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM workspace_members wm 
          WHERE wm.workspace_id = alert_deliveries.workspace_id 
          AND wm.user_id = auth.uid()
          AND wm.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;
-- NOTE: No INSERT policy for client (Service Role only)

-- 3. Audit Log Retention (90 days)
DROP FUNCTION IF EXISTS public.cleanup_expired_audit_logs();

CREATE OR REPLACE FUNCTION public.cleanup_expired_audit_logs()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM public.audit_logs
  WHERE created_at < (now() - INTERVAL '90 days');

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
