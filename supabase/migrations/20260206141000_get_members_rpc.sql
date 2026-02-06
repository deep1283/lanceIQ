-- Securely fetch workspace members with their emails
-- We need SECURITY DEFINER to access auth.users emails
CREATE OR REPLACE FUNCTION public.get_workspace_members(lookup_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  email varchar,
  role text,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if executing user is a member of the workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE workspace_id = lookup_workspace_id 
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    wm.user_id,
    au.email::varchar,
    wm.role,
    wm.created_at
  FROM public.workspace_members wm
  JOIN auth.users au ON wm.user_id = au.id
  WHERE wm.workspace_id = lookup_workspace_id
  ORDER BY wm.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_members(uuid) TO authenticated;
