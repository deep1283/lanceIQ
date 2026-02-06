ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

-- Optional: Add comment
COMMENT ON COLUMN public.workspaces.subscription_current_period_end IS 'End date of the current subscription period (from Stripe/Dodo)';
