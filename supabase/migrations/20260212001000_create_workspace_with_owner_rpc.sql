-- Migration: Transactional workspace creation RPC
-- Gap Fix #5: Prevents orphaned workspaces by wrapping workspace + member insert in one transaction

CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(
  p_name text,
  p_provider text,
  p_api_key_hash text,
  p_api_key_last4 text,
  p_store_raw_body boolean,
  p_raw_body_retention_days int,
  p_created_by uuid,
  p_encrypted_secret text DEFAULT NULL,
  p_secret_last4 text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_workspace_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_created_by IS NOT NULL AND p_created_by <> v_actor THEN
    RAISE EXCEPTION 'p_created_by must match auth.uid()';
  END IF;

  INSERT INTO public.workspaces (
    name, provider, api_key_hash, api_key_last4,
    store_raw_body, raw_body_retention_days,
    created_by, encrypted_secret, secret_last4
  ) VALUES (
    p_name, p_provider, p_api_key_hash, p_api_key_last4,
    p_store_raw_body, p_raw_body_retention_days,
    v_actor, p_encrypted_secret, p_secret_last4
  ) RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_actor, 'owner');

  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Restrict access: only authenticated users can call this
REVOKE ALL ON FUNCTION public.create_workspace_with_owner FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner TO authenticated;
