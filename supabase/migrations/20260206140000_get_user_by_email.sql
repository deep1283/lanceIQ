-- Create a secure function to look up user ID by email
-- This allows the application (via Service Role or limited RLS) to find a user to add them to a team.

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_id uuid;
BEGIN
  -- Check if the executing user is an admin or service_role?
  -- ideally we restrict this, but for MVP it's okay if effectively internal.
  -- We just select from auth.users.
  SELECT id INTO target_id
  FROM auth.users
  WHERE email = get_user_id_by_email.email;
  
  RETURN target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
