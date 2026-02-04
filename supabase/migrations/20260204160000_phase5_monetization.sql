-- Phase 5: Monetization & Retention

-- 1. Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
    dodo_subscription_id text UNIQUE NOT NULL,
    customer_id text,
    billing_email text,
    plan_id text NOT NULL,
    status text CHECK (status IN ('active', 'past_due', 'canceled', 'on_hold', 'paused', 'free')) NOT NULL,
    current_period_end timestamptz,
    cancel_at_period_end boolean DEFAULT false,
    plan_source text CHECK (plan_source IN ('dodo', 'manual')) DEFAULT 'dodo',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_id ON public.subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dodo_id ON public.subscriptions(dodo_subscription_id);

-- RLS for Subscriptions (Viewable by workspace members)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view subscriptions"
    ON public.subscriptions
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id 
            FROM public.workspace_members 
            WHERE user_id = auth.uid()
        )
    );

-- 2. Update Workspaces Table (Denormalized Plan status)
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'free')),
ADD COLUMN IF NOT EXISTS billing_customer_id text,
ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

-- 3. Ingested Events (Already has received_at, index it for cleanup)
CREATE INDEX IF NOT EXISTS idx_ingested_events_received_at ON public.ingested_events(received_at);

-- 4. Tiered Cleanup Function
DROP FUNCTION IF EXISTS public.cleanup_expired_raw_bodies();

CREATE OR REPLACE FUNCTION public.cleanup_expired_raw_bodies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Free Plan: Delete after 24 hours
  DELETE FROM public.ingested_events
  WHERE 
    received_at < (now() - INTERVAL '24 hours')
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE plan = 'free'
    );

  -- 2. Pro Plan: Delete after 7 days
  DELETE FROM public.ingested_events
  WHERE 
    received_at < (now() - INTERVAL '7 days')
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE plan = 'pro'
    );

  -- 3. Enterprise Plan: Delete after 30 days (default)
  DELETE FROM public.ingested_events
  WHERE 
    received_at < (now() - INTERVAL '30 days')
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE plan = 'enterprise'
    );
    
  -- Optional: Vacuum analysis could be triggered here if high volume
END;
$$;
