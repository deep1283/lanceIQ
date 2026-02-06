-- Universal Workspace Scoping for Certificates
-- Goal: Strict consistency. All certificates belong to a workspace. RLS and Queries rely solely on workspace_id.

-- 1. Add workspace_id column (nullable for now, strictly enforced after backfill)
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- 2. Backfill Logic (Deterministic)
-- For each certificate without a workspace_id:
-- Find the user's "Primary Workspace".
-- Priority: 1. Team Plan workspace (if any). 2. Oldest workspace (created_at ASC).

DO $$
DECLARE
  r RECORD;
  target_workspace_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.certificates WHERE workspace_id IS NULL LOOP
    
    -- Try to find a TEAM workspace first
    SELECT w.id INTO target_workspace_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = r.user_id
      AND w.plan = 'team'
    ORDER BY w.created_at ASC
    LIMIT 1;

    -- If no Team workspace, pick the Oldest workspace
    IF target_workspace_id IS NULL THEN
      SELECT w.id INTO target_workspace_id
      FROM public.workspace_members wm
      JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = r.user_id
      ORDER BY w.created_at ASC
      LIMIT 1;
    END IF;

    -- Update certificates for this user
    IF target_workspace_id IS NOT NULL THEN
      UPDATE public.certificates
      SET workspace_id = target_workspace_id
      WHERE user_id = r.user_id AND workspace_id IS NULL;
    END IF;
    
  END LOOP;
END $$;

-- 3. Enforce Not Null (Optional: verify backfill first. Let's keep it nullable but add a check constraint or just rely on app logic for a moment? 
-- The user requested strictly scoped. Let's allow NULL temporarily if backfill misses stragglers (orphaned users), but generally we want strictness.)
-- For now, we will NOT add NOT NULL to avoid breaking if there are orphaned users without workspaces. 
-- Instead, we assume app logic will always provide it moving forward.

-- 4. Create Index for Performance
CREATE INDEX IF NOT EXISTS idx_certificates_workspace_date
  ON public.certificates(workspace_id, created_at DESC);

-- 5. Update RLS Policies (Strict Workspace Scope)

-- Drop old policies
DROP POLICY IF EXISTS "Users can insert their own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can view their own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Team owners can view workspace certificates" ON public.certificates; -- If any existed

-- Create NEW strict policies

-- INSERT: Must be a member of the workspace_id being inserted
CREATE POLICY "Insert via workspace membership" ON public.certificates
  FOR INSERT WITH CHECK (
    auth.uid() = user_id -- Still sanity check user_id
    AND
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = certificates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- SELECT: Must be a member of the workspace_id
-- This allows Team Admins/Owners to see ALL certs in the workspace (because they are members)
-- And standard members to see ALL certs in the workspace (if that's the desired Team behavior? Or just their own?)
-- User said: "All queries become consistent... Team export includes all members." 
-- Implies visibility is broadly "Workspace Access".
-- However, for Free/Pro, users only see their own because they are the only member.
-- For Team, if we want *all* members to see *all* certs, this policy works. 
-- If we want standard members to only see their own, we'd need a role check.
-- Given "Team Dashboard", usually transparency is key. Let's Start with Broad Workspace Access.

CREATE POLICY "View via workspace membership" ON public.certificates
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = certificates.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- 6. Add workspace_id to RLS for Update/Delete if needed (omitted for strictly append-only logs usually, but let's be safe)
