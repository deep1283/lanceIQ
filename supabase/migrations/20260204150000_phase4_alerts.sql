-- Phase 4: Alerts + Dedup support

-- 1) Ingested events: mark duplicates
ALTER TABLE public.ingested_events
  ADD COLUMN IF NOT EXISTS is_duplicate boolean DEFAULT false;

-- Ensure provider event id lookup is efficient
CREATE INDEX IF NOT EXISTS idx_ingested_provider_event_id
  ON public.ingested_events(provider_event_id);

-- Expand signature_reason check to allow 'duplicate'
ALTER TABLE public.ingested_events
  DROP CONSTRAINT IF EXISTS ingested_events_signature_reason_check;

ALTER TABLE public.ingested_events
  ADD CONSTRAINT ingested_events_signature_reason_check
  CHECK (
    signature_reason IS NULL OR signature_reason IN (
      'missing_header', 'missing_secret', 'unsupported_provider',
      'mismatch', 'malformed_signature', 'timestamp_expired', 'no_secret',
      'duplicate'
    )
  );

-- 2) Workspace alert settings
CREATE TABLE IF NOT EXISTS public.workspace_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel text CHECK (channel IN ('email', 'slack', 'webhook')),
  destination text NOT NULL,
  enabled boolean DEFAULT true,
  critical_fail_count int DEFAULT 3 CHECK (critical_fail_count BETWEEN 1 AND 100),
  window_minutes int DEFAULT 10 CHECK (window_minutes BETWEEN 1 AND 60),
  cooldown_minutes int DEFAULT 30 CHECK (cooldown_minutes BETWEEN 1 AND 1440),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_alert_settings_workspace
  ON public.workspace_alert_settings(workspace_id);

ALTER TABLE public.workspace_alert_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access alert settings via membership' AND tablename = 'workspace_alert_settings') THEN
    CREATE POLICY "Access alert settings via membership" ON public.workspace_alert_settings
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_alert_settings.workspace_id
          AND wm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Members can create alert settings' AND tablename = 'workspace_alert_settings') THEN
    CREATE POLICY "Members can create alert settings" ON public.workspace_alert_settings
      FOR INSERT WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_alert_settings.workspace_id
          AND wm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners manage alert settings' AND tablename = 'workspace_alert_settings') THEN
    CREATE POLICY "Owners manage alert settings" ON public.workspace_alert_settings
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_alert_settings.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'owner'
        )
      );
  END IF;
END $$;

