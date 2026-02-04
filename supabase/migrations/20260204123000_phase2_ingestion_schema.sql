-- Phase 2: Ingestion & Verification Schema

-- 1. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT CHECK (provider IN ('stripe', 'razorpay', 'generic')),
  api_key_hash TEXT NOT NULL UNIQUE,  -- HMAC-SHA256 with server secret
  api_key_last4 TEXT NOT NULL,
  store_raw_body BOOLEAN DEFAULT FALSE,
  raw_body_retention_days INT DEFAULT 7 CHECK (raw_body_retention_days BETWEEN 1 AND 30),
  -- Creator tracking (used to safely bootstrap the first owner membership)
  created_by UUID REFERENCES auth.users(id),
  -- Phase 3-ready: optional encrypted secret storage
  encrypted_secret TEXT,
  secret_last4 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- 2. Workspace Members
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- 3. Ingested Events
CREATE TABLE IF NOT EXISTS ingested_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  payload JSONB,
  headers JSONB,
  raw_body_sha256 TEXT NOT NULL,
  raw_body TEXT,
  raw_body_expires_at TIMESTAMPTZ,
  detected_provider TEXT,
  signature_status TEXT DEFAULT 'not_verified'
    CHECK (signature_status IN ('verified', 'failed', 'not_verified')),
  signature_reason TEXT
    CHECK (signature_reason IS NULL OR signature_reason IN (
      'missing_header', 'missing_secret', 'unsupported_provider',
      'mismatch', 'malformed_signature', 'timestamp_expired', 'no_secret'
    )),
  provider_event_id TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT raw_body_requires_expiry 
    CHECK (raw_body IS NULL OR raw_body_expires_at IS NOT NULL)
);

ALTER TABLE ingested_events ENABLE ROW LEVEL SECURITY;

-- 4. Verification History
CREATE TABLE IF NOT EXISTS verification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  ingested_event_id UUID REFERENCES ingested_events(id),
  certificate_id UUID REFERENCES certificates(id),
  triggered_by TEXT CHECK (triggered_by IN ('ingest', 'user', 'bulk')),
  provider TEXT,
  signature_status TEXT CHECK (signature_status IN ('verified', 'failed', 'not_verified')),
  signature_reason TEXT,
  verification_method TEXT,
  secret_hint TEXT,
  error TEXT,
  raw_body_sha256 TEXT,
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE verification_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Workspace Members: Users see their own memberships
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own memberships' AND tablename = 'workspace_members') THEN
    CREATE POLICY "Users see own memberships" ON workspace_members
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Workspace Members: Owners can manage members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners manage members' AND tablename = 'workspace_members') THEN
    CREATE POLICY "Owners manage members" ON workspace_members
      FOR ALL USING (
        EXISTS (SELECT 1 FROM workspace_members wm 
                WHERE wm.workspace_id = workspace_members.workspace_id 
                AND wm.user_id = auth.uid() AND wm.role = 'owner')
      );
  END IF;
END $$;

-- Workspace Members: Workspace creator can bootstrap the initial owner membership row.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Creator can add initial owner' AND tablename = 'workspace_members') THEN
    CREATE POLICY "Creator can add initial owner" ON workspace_members
      FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
        AND role = 'owner'
        AND EXISTS (
          SELECT 1 FROM workspaces w
          WHERE w.id = workspace_members.workspace_id
          AND w.created_by = auth.uid()
        )
      );
  END IF;
END $$;

-- Workspaces: Any authed user can create
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create workspaces' AND tablename = 'workspaces') THEN
    CREATE POLICY "Users can create workspaces" ON workspaces FOR INSERT
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

-- Workspaces: Access via membership
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access via membership' AND tablename = 'workspaces') THEN
    CREATE POLICY "Access via membership" ON workspaces FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_members.workspace_id = workspaces.id 
        AND workspace_members.user_id = auth.uid()
      ));
  END IF;
END $$;

-- Workspaces: Owners can update
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners manage workspace' AND tablename = 'workspaces') THEN
    CREATE POLICY "Owners manage workspace" ON workspaces FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_members.workspace_id = workspaces.id 
        AND workspace_members.user_id = auth.uid() 
        AND workspace_members.role = 'owner'
      ));
  END IF;
END $$;

-- Workspaces: Owners can delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners delete workspace' AND tablename = 'workspaces') THEN
    CREATE POLICY "Owners delete workspace" ON workspaces FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_members.workspace_id = workspaces.id 
        AND workspace_members.user_id = auth.uid() 
        AND workspace_members.role = 'owner'
      ));
  END IF;
END $$;

-- Ingested Events: Access via workspace membership
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access via workspace membership' AND tablename = 'ingested_events') THEN
    CREATE POLICY "Access via workspace membership" ON ingested_events FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM workspace_members 
        WHERE workspace_members.workspace_id = ingested_events.workspace_id 
        AND workspace_members.user_id = auth.uid()
      ));
  END IF;
END $$;

-- Verification History: User can see own verifications OR via workspace membership
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access own or via workspace' AND tablename = 'verification_history') THEN
    CREATE POLICY "Access own or via workspace" ON verification_history FOR SELECT
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM ingested_events ie
          JOIN workspace_members wm ON wm.workspace_id = ie.workspace_id
          WHERE ie.id = verification_history.ingested_event_id
          AND wm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ingested_workspace_status 
  ON ingested_events(workspace_id, signature_status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_user_created
  ON verification_history(user_id, verified_at DESC);
