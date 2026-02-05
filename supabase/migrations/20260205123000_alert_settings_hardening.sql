-- Hardening alert settings: uniqueness, update tracking, and admin permissions

-- Ensure one settings row per workspace
ALTER TABLE public.workspace_alert_settings
  ADD CONSTRAINT workspace_alert_settings_workspace_id_key UNIQUE (workspace_id);

-- Track updates
ALTER TABLE public.workspace_alert_settings
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- Allow owners and admins to manage alert settings (update/delete)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Owners manage alert settings'
      AND tablename = 'workspace_alert_settings'
  ) THEN
    DROP POLICY "Owners manage alert settings" ON public.workspace_alert_settings;
  END IF;

  CREATE POLICY "Owners and admins manage alert settings" ON public.workspace_alert_settings
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = workspace_alert_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
      )
    );
END $$;

