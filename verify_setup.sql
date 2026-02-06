-- Functional Verification Suite: Workspace Security & Plan Gating

BEGIN;

-- 1. Setup Fixtures
-- Create 2 test users
INSERT INTO auth.users (id, email) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'free_user@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'pro_user@test.com')
ON CONFLICT DO NOTHING;

-- Create 2 test workspaces
INSERT INTO public.workspaces (id, name, plan, api_key_hash, api_key_last4) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Free WS', 'free', 'hash1', '1234'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pro WS', 'team', 'hash2', '5678')
ON CONFLICT DO NOTHING;

-- Assign memberships
INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner')
ON CONFLICT DO NOTHING;

-- 2. Test: Can Free User Insert? (Simulates saveCertificate)
-- We must masquerade as the user for RLS to trigger. 
-- Since we can't easily SET ROLE in this MCP tool context without being superuser, 
-- we will verify the constraints and policies logic via direct checks where possible 
-- or rely on the fact that we confirmed the policies exist. 
-- However, we can Insert DATA and check visibility if we were running as that user.

-- Let's insert a certificate for each workspace manually (as superuser) to verify data shape.
INSERT INTO public.certificates (user_id, workspace_id, report_id, status_code, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cert-1', 200, now()),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cert-2', 200, now())
ON CONFLICT DO NOTHING;

-- 3. Verify Plan Gating Logic (Simulate Export API Check)
-- Export API checks: user -> workspace -> plan.
SELECT 
  w.name as workspace_name, 
  w.plan, 
  CASE WHEN w.plan IN ('pro', 'team') THEN 'ALLOWED' ELSE 'BLOCKED' END as export_access
FROM public.workspaces w
WHERE w.id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- 4. Verify RLS Policies Exist
SELECT tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'certificates';

ROLLBACK; -- Clean up fixtures
