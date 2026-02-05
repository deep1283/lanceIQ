-- Phase 6.1: Auto-update triggers

-- 1. Add columns to workspace_alert_settings if missing
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_alert_settings' AND column_name = 'updated_at') THEN
        ALTER TABLE workspace_alert_settings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_alert_settings' AND column_name = 'updated_by') THEN
        ALTER TABLE workspace_alert_settings ADD COLUMN updated_by UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Create generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Apply triggers
DROP TRIGGER IF EXISTS set_timestamp_workspace_alert_settings ON workspace_alert_settings;
CREATE TRIGGER set_timestamp_workspace_alert_settings
    BEFORE UPDATE ON workspace_alert_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_timestamp_alert_deliveries ON alert_deliveries;
CREATE TRIGGER set_timestamp_alert_deliveries
    BEFORE UPDATE ON alert_deliveries
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
