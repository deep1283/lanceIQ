-- Harden get_user_id_by_email to prevent user enumeration
-- Replace the old function signature with a workspace-scoped, role-checked version.

DROP FUNCTION IF EXISTS public.get_user_id_by_email(text);

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email text, lookup_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_id uuid;
  ws_plan text;
BEGIN
  -- Only owners/admins can look up users, and only for team workspaces
  IF get_workspace_role(lookup_workspace_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT plan INTO ws_plan FROM public.workspaces WHERE id = lookup_workspace_id;
  IF ws_plan IS DISTINCT FROM 'team' THEN
    RAISE EXCEPTION 'Team plan required';
  END IF;

  SELECT id INTO target_id
  FROM auth.users
  WHERE lower(email) = lower(get_user_id_by_email.email);

  RETURN target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text, uuid) TO service_role;
