-- Resolve Orphaned Certificates and Enforce Workspace Integrity

DO $$
DECLARE
  r RECORD;
  new_workspace_id uuid;
  user_email text;
BEGIN
  -- 1. Identify users with orphaned certificates (NULL workspace_id)
  FOR r IN 
    SELECT DISTINCT user_id 
    FROM public.certificates 
    WHERE workspace_id IS NULL 
  LOOP
    
    -- Check if they ALREADY have a workspace (maybe the previous backfill missed them for some reason? edge case)
    -- If they do, use the oldest one.
    SELECT wm.workspace_id INTO new_workspace_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = r.user_id
    ORDER BY w.created_at ASC
    LIMIT 1;

    -- If STILL null (True Orphan - No Workspace Membership), create one.
    IF new_workspace_id IS NULL THEN
      
      -- Create new Remedial Workspace
      INSERT INTO public.workspaces (name, plan, api_key_hash, api_key_last4)
      VALUES (
        'My Workspace',
        'free',
        'remediation_placeholder_' || md5(random()::text), -- Placeholder hash
        '0000'
      )
      RETURNING id INTO new_workspace_id;

      -- Add user as owner
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (new_workspace_id, r.user_id, 'owner');
      
      RAISE NOTICE 'Created remedial workspace % for user %', new_workspace_id, r.user_id;
      
    END IF;

    -- Backfill the certificates
    UPDATE public.certificates
    SET workspace_id = new_workspace_id
    WHERE user_id = r.user_id AND workspace_id IS NULL;
    
  END LOOP;
END $$;

-- 2. Enforce NOT NULL constraint
-- Now that we are confident all rows are backfilled
ALTER TABLE public.certificates
  ALTER COLUMN workspace_id SET NOT NULL;
