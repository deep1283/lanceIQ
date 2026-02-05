-- Fix Infinite Recursion in RLS policies

-- 1. Create a secure function to check role without triggering RLS
-- SECURITY DEFINER ensures it runs with permissions of the creator (bypassing RLS on workspace_members)
CREATE OR REPLACE FUNCTION public.get_workspace_role(lookup_workspace_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = lookup_workspace_id
  AND user_id = auth.uid();
$$;

-- 2. Update 'Owners manage members' policy on workspace_members
DROP POLICY IF EXISTS "Owners manage members" ON workspace_members;
CREATE POLICY "Owners manage members" ON workspace_members
  FOR ALL
  USING (
    get_workspace_role(workspace_id) = 'owner'
  );

-- 3. Update Audit Logs policy to use the secure function (Optimization & Safety)
DROP POLICY IF EXISTS "Owners and Admins view audit logs" ON audit_logs;
CREATE POLICY "Owners and Admins view audit logs" ON audit_logs
  FOR SELECT USING (
    get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- 4. Update Alert Deliveries policy to use the secure function
DROP POLICY IF EXISTS "Owners and Admins view alert deliveries" ON alert_deliveries;
CREATE POLICY "Owners and Admins view alert deliveries" ON alert_deliveries
  FOR SELECT USING (
    get_workspace_role(workspace_id) IN ('owner', 'admin')
  );
