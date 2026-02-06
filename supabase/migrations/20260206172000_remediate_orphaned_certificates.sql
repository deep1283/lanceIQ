-- Remediate orphaned certificates and enforce workspace_id NOT NULL
-- 1) Assign workspace_id for users who have memberships but null certificates
-- 2) Create a remedial workspace for users with orphaned certs and no memberships
-- 3) Enforce NOT NULL once remediation is complete

-- 1) Assign primary workspace for members (Team first, then oldest)
WITH primary_workspace AS (
  SELECT
    wm.user_id,
    (
      SELECT w.id
      FROM public.workspace_members wm2
      JOIN public.workspaces w ON w.id = wm2.workspace_id
      WHERE wm2.user_id = wm.user_id
      ORDER BY (w.plan = 'team') DESC, w.created_at ASC
      LIMIT 1
    ) AS workspace_id
  FROM public.workspace_members wm
  GROUP BY wm.user_id
)
UPDATE public.certificates c
SET workspace_id = p.workspace_id
FROM primary_workspace p
WHERE c.user_id = p.user_id
  AND c.workspace_id IS NULL
  AND p.workspace_id IS NOT NULL;

-- 2) For users with orphaned certs and no memberships, create a remedial workspace
DO $$
DECLARE
  r RECORD;
  new_workspace_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT c.user_id
    FROM public.certificates c
    LEFT JOIN public.workspace_members wm ON wm.user_id = c.user_id
    WHERE c.workspace_id IS NULL
      AND wm.user_id IS NULL
  LOOP
    INSERT INTO public.workspaces (
      name,
      provider,
      api_key_hash,
      api_key_last4,
      store_raw_body,
      raw_body_retention_days,
      created_by,
      plan,
      subscription_status
    )
    VALUES (
      'Remedial Workspace',
      'generic',
      encode(gen_random_bytes(32), 'hex'),
      right(encode(gen_random_bytes(4), 'hex'), 4),
      false,
      7,
      r.user_id,
      'free',
      'free'
    )
    RETURNING id INTO new_workspace_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (new_workspace_id, r.user_id, 'owner')
    ON CONFLICT DO NOTHING;

    UPDATE public.certificates
    SET workspace_id = new_workspace_id
    WHERE user_id = r.user_id
      AND workspace_id IS NULL;
  END LOOP;
END $$;

-- 3) Enforce NOT NULL (will fail if any stragglers remain)
ALTER TABLE public.certificates
  ALTER COLUMN workspace_id SET NOT NULL;
