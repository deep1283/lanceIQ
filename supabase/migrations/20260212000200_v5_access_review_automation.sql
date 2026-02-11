-- Migration C: Access Review Automation
-- Description: Scheduling and notification status for access reviews.

-- 1. Schedules
CREATE TABLE IF NOT EXISTS public.access_review_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rrule text NOT NULL, -- e.g. 'FREQ=MONTHLY;INTERVAL=3'
  next_run_at timestamptz,
  last_run_at timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id) -- One schedule per workspace
);

ALTER TABLE public.access_review_schedules ENABLE ROW LEVEL SECURITY;

-- 2. Notifications
CREATE TABLE IF NOT EXISTS public.access_review_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.access_review_cycles(id) ON DELETE CASCADE,
  channel text CHECK (channel IN ('email', 'slack', 'webhook')),
  recipient text NOT NULL,
  status text CHECK (status IN ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_review_notifs_cycle 
  ON public.access_review_notifications(cycle_id);

ALTER TABLE public.access_review_notifications ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

DO $$ BEGIN
  -- Schedules: Owner/Admin SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view review schedules' AND tablename = 'access_review_schedules') THEN
    CREATE POLICY "Owners/Admins view review schedules" ON public.access_review_schedules
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = access_review_schedules.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role: ALL (Scheduler)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages review schedules' AND tablename = 'access_review_schedules') THEN
    CREATE POLICY "Service Role manages review schedules" ON public.access_review_schedules
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- Notifications: Owner/Admin SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view review notifications' AND tablename = 'access_review_notifications') THEN
    CREATE POLICY "Owners/Admins view review notifications" ON public.access_review_notifications
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = access_review_notifications.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  -- Service Role: ALL (Sender)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages review notifications' AND tablename = 'access_review_notifications') THEN
    CREATE POLICY "Service Role manages review notifications" ON public.access_review_notifications
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
  
  -- Viewers/Auditors: View Schedules and Notifications (Proof of process)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Viewers view review schedules' AND tablename = 'access_review_schedules') THEN
    CREATE POLICY "Viewers view review schedules" ON public.access_review_schedules
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = access_review_schedules.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('viewer', 'legal_hold_manager'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Viewers view review notifications' AND tablename = 'access_review_notifications') THEN
    CREATE POLICY "Viewers view review notifications" ON public.access_review_notifications
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = access_review_notifications.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('viewer', 'legal_hold_manager'))
      );
  END IF;
END $$;
