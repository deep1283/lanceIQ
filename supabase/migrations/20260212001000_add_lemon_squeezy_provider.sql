-- Allow Lemon Squeezy as a supported provider
ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_provider_check;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_provider_check
  CHECK (provider IN ('stripe', 'razorpay', 'lemon_squeezy', 'generic'));
