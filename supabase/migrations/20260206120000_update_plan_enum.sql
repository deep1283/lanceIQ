-- Rename 'enterprise' to 'team' in allowed values (or just add 'team' and keeping enterprise for legacy safety, but user was specific)
-- robust approach: drop constraint, update any existing 'enterprise' to 'team', add new constraint.

DO $$
BEGIN
    -- 1. Drop the old constraint
    ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_plan_check;

    -- 2. Update any existing data (if any existed, though unexpected for 'enterprise' if not offered)
    UPDATE public.workspaces SET plan = 'team' WHERE plan = 'enterprise';

    -- 3. Add new constraint
    ALTER TABLE public.workspaces 
    ADD CONSTRAINT workspaces_plan_check 
    CHECK (plan IN ('free', 'pro', 'team'));
END $$;
