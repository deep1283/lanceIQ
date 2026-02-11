-- Allow Lemon Squeezy as a supported provider
-- Note: existing rows may have provider = NULL (pre-provider workspaces),
-- so the constraint must permit NULL values.
ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_provider_check;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_provider_check
  CHECK (provider IS NULL OR provider IN ('stripe', 'razorpay', 'lemon_squeezy', 'generic'));
