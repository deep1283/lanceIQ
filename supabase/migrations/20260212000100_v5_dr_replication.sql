-- Migration B: DR / Replication Flags
-- Description: Multi-region config and status tracking.

-- 1. Replication Configs
CREATE TABLE IF NOT EXISTS public.replication_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  region text NOT NULL, -- e.g. 'us-west-2'
  mode text CHECK (mode IN ('active-active', 'active-passive', 'read-replica')),
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, region)
);

ALTER TABLE public.replication_configs ENABLE ROW LEVEL SECURITY;

-- 2. Replication Status
CREATE TABLE IF NOT EXISTS public.replication_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replication_config_id uuid REFERENCES public.replication_configs(id) ON DELETE CASCADE,
  last_synced_at timestamptz,
  lag_seconds int DEFAULT 0,
  status text CHECK (status IN ('healthy', 'lagging', 'broken', 'syncing')),
  details jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_replication_status_config
  ON public.replication_status(replication_config_id);

ALTER TABLE public.replication_status ENABLE ROW LEVEL SECURITY;

-- Keep updated_at current
DROP TRIGGER IF EXISTS trg_replication_status_updated_at ON public.replication_status;
CREATE TRIGGER trg_replication_status_updated_at
  BEFORE UPDATE ON public.replication_status
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- 3. RLS Policies

DO $$ BEGIN
  -- Configs: Owner/Admin SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view replication config' AND tablename = 'replication_configs') THEN
    CREATE POLICY "Owners/Admins view replication config" ON public.replication_configs
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = replication_configs.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role: ALL (Manage topology)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages replication config' AND tablename = 'replication_configs') THEN
    CREATE POLICY "Service Role manages replication config" ON public.replication_configs
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- Status: Owner/Admin SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view replication status' AND tablename = 'replication_status') THEN
    CREATE POLICY "Owners/Admins view replication status" ON public.replication_status
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = (SELECT workspace_id FROM public.replication_configs WHERE id = replication_status.replication_config_id) 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role: ALL (Update lag)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages replication status' AND tablename = 'replication_status') THEN
    CREATE POLICY "Service Role manages replication status" ON public.replication_status
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
