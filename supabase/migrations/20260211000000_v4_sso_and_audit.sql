-- Migration: V4 Enterprise Identity & Audit (Tier 1)
-- Description: Adds tables for SSO/SCIM, Access Reviews, Key Rotation, SLA/Incidents, and enhances Audit logging.

-- 1. SSO & Identity Mapping

-- 1a. SSO Providers
CREATE TABLE IF NOT EXISTS public.sso_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL, -- e.g. "acme.com"
  metadata_xml text,    -- SAML metadata or OIDC config
  scim_token_hash text, -- Hashed bearer token for SCIM clients
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sso_providers_updated_at ON public.sso_providers;
CREATE TRIGGER trg_sso_providers_updated_at
  BEFORE UPDATE ON public.sso_providers
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- 1b. Identity Mappings
CREATE TABLE IF NOT EXISTS public.identity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.sso_providers(id) ON DELETE CASCADE,
  external_id text NOT NULL, -- Immutable ID from IdP
  external_email text,
  scim_attributes jsonb,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  -- Prevent double-linking a local user in the same workspace
  UNIQUE(workspace_id, user_id),
  
  -- Unique external ID per provider
  UNIQUE(provider_id, external_id)
);

-- Case-insensitive index for email lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_mappings_provider_email 
  ON public.identity_mappings(provider_id, lower(external_email))
  WHERE external_email IS NOT NULL;

ALTER TABLE public.identity_mappings ENABLE ROW LEVEL SECURITY;

-- 1c. SCIM Tokens (rotation history + revocation)
CREATE TABLE IF NOT EXISTS public.scim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.sso_providers(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  UNIQUE(provider_id, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_scim_tokens_workspace_created
  ON public.scim_tokens(workspace_id, created_at DESC);

ALTER TABLE public.scim_tokens ENABLE ROW LEVEL SECURITY;

-- Ensure identity_mappings provider matches workspace
CREATE OR REPLACE FUNCTION public.validate_identity_mapping_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sso_providers p
    WHERE p.id = NEW.provider_id
    AND p.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'Identity mapping provider does not match workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_identity_mapping_provider ON public.identity_mappings;
CREATE TRIGGER trg_validate_identity_mapping_provider
  BEFORE INSERT OR UPDATE ON public.identity_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_identity_mapping_provider();

-- Ensure scim_tokens provider matches workspace
CREATE OR REPLACE FUNCTION public.validate_scim_token_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sso_providers p
    WHERE p.id = NEW.provider_id
    AND p.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'SCIM token provider does not match workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_scim_token_provider ON public.scim_tokens;
CREATE TRIGGER trg_validate_scim_token_provider
  BEFORE INSERT OR UPDATE ON public.scim_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_scim_token_provider();


-- 2. Audit & Security Extensions

-- 2a. Access Review Cycles
CREATE TABLE IF NOT EXISTS public.access_review_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id),
  status text CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_review_cycles_ws_created 
  ON public.access_review_cycles(workspace_id, created_at);

ALTER TABLE public.access_review_cycles ENABLE ROW LEVEL SECURITY;

-- 2b. Access Review Decisions (Attestation)
CREATE TABLE IF NOT EXISTS public.access_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES public.access_review_cycles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users(id),
  decision text CHECK (decision IN ('approved', 'revoked', 'modified')),
  notes text,
  reviewed_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate decisions for same user in same cycle
  UNIQUE(cycle_id, target_user_id)
);

ALTER TABLE public.access_review_decisions ENABLE ROW LEVEL SECURITY;

-- 2c. Key Rotation History
CREATE TABLE IF NOT EXISTS public.api_key_rotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id), -- Who rotated it
  key_type text CHECK (key_type IN ('api_key', 'signing_secret')),
  rotated_at timestamptz DEFAULT now(),
  reason text, -- e.g. "compromise", "scheduled"
  old_key_hash_hint text -- Partial hash for audit trail
);

ALTER TABLE public.api_key_rotations ENABLE ROW LEVEL SECURITY;


-- 3. Resilience & SLA

-- 3a. SLA Policies
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, -- e.g. "Gold Tier 99.9%"
  target_availability numeric(5,2), -- 99.90
  violation_penalty_rate numeric, -- Credits per hour down
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

-- 3b. Incident Reports
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, -- Null for global
  title text NOT NULL,
  severity text CHECK (severity IN ('sev1', 'sev2', 'sev3')),
  status text CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  started_at timestamptz NOT NULL,
  resolved_at timestamptz,
  affected_components text[], -- ['api', 'dashboard']
  public_note text, -- Visible to customers
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

-- 3c. Retention Policies
CREATE TABLE IF NOT EXISTS public.retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('audit_logs', 'incident_reports', 'access_reviews', 'api_key_rotations', 'identity_mappings')),
  retention_days int NOT NULL CHECK (retention_days > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_workspace
  ON public.retention_policies(workspace_id);

ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_retention_policies_updated_at ON public.retention_policies;
CREATE TRIGGER trg_retention_policies_updated_at
  BEFORE UPDATE ON public.retention_policies
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- 4. RLS Policies

-- SSO Providers: Owners/Admins + Service Role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view SSO' AND tablename = 'sso_providers') THEN
    CREATE POLICY "Owners/Admins view SSO" ON public.sso_providers
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = sso_providers.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins manage SSO' AND tablename = 'sso_providers') THEN
    CREATE POLICY "Owners/Admins manage SSO" ON public.sso_providers
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = sso_providers.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = sso_providers.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages SSO' AND tablename = 'sso_providers') THEN
    CREATE POLICY "Service Role manages SSO" ON public.sso_providers
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Identity Mappings: Owners/Admins + Service Role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view mappings' AND tablename = 'identity_mappings') THEN
    CREATE POLICY "Owners/Admins view mappings" ON public.identity_mappings
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = identity_mappings.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages mappings' AND tablename = 'identity_mappings') THEN
    CREATE POLICY "Service Role manages mappings" ON public.identity_mappings
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- SCIM Tokens: Owners/Admins view, Service Role manages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view SCIM tokens' AND tablename = 'scim_tokens') THEN
    CREATE POLICY "Owners/Admins view SCIM tokens" ON public.scim_tokens
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = scim_tokens.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages SCIM tokens' AND tablename = 'scim_tokens') THEN
    CREATE POLICY "Service Role manages SCIM tokens" ON public.scim_tokens
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Access Reviews: Owners/Admins + Service Role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins manage reviews' AND tablename = 'access_review_cycles') THEN
    CREATE POLICY "Owners/Admins manage reviews" ON public.access_review_cycles
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = access_review_cycles.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = access_review_cycles.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins manage decisions' AND tablename = 'access_review_decisions') THEN
    CREATE POLICY "Owners/Admins manage decisions" ON public.access_review_decisions
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = (SELECT workspace_id FROM public.access_review_cycles WHERE id = access_review_decisions.cycle_id) 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = (SELECT workspace_id FROM public.access_review_cycles WHERE id = access_review_decisions.cycle_id) 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages reviews' AND tablename = 'access_review_cycles') THEN
    CREATE POLICY "Service Role manages reviews" ON public.access_review_cycles
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages decisions' AND tablename = 'access_review_decisions') THEN
    CREATE POLICY "Service Role manages decisions" ON public.access_review_decisions
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Key Rotations: Owners/Admins view, Service Role inserts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins view rotations' AND tablename = 'api_key_rotations') THEN
    CREATE POLICY "Owners/Admins view rotations" ON public.api_key_rotations
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = api_key_rotations.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role inserts rotations' AND tablename = 'api_key_rotations') THEN
    CREATE POLICY "Service Role inserts rotations" ON public.api_key_rotations
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- SLA/Incidents: Owners/Admins manage policies, Members view incidents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins manage policies' AND tablename = 'sla_policies') THEN
    CREATE POLICY "Owners/Admins manage policies" ON public.sla_policies
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = sla_policies.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = sla_policies.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Members view incidents' AND tablename = 'incident_reports') THEN
    CREATE POLICY "Members view incidents" ON public.incident_reports
      FOR SELECT USING (
        workspace_id IS NULL OR -- Global incidents
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = incident_reports.workspace_id 
                AND wm.user_id = auth.uid())
      );
  END IF;
  
  -- Service Role can manage global incidents
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages incidents' AND tablename = 'incident_reports') THEN
    CREATE POLICY "Service Role manages incidents" ON public.incident_reports
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Retention Policies: Owners/Admins manage, Service Role manages
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners/Admins manage retention' AND tablename = 'retention_policies') THEN
    CREATE POLICY "Owners/Admins manage retention" ON public.retention_policies
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = retention_policies.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = retention_policies.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('owner', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role manages retention' AND tablename = 'retention_policies') THEN
    CREATE POLICY "Service Role manages retention" ON public.retention_policies
      FOR ALL USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- Viewers/Auditors Read Access
  -- Sso Providers: viewer, legal_hold_manager
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Viewers view SSO' AND tablename = 'sso_providers') THEN
    CREATE POLICY "Viewers view SSO" ON public.sso_providers
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = sso_providers.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('viewer', 'legal_hold_manager'))
      );
  END IF;

  -- Access Reviews: viewer, legal_hold_manager (Auditors need to see proof)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Viewers view reviews' AND tablename = 'access_review_cycles') THEN
    CREATE POLICY "Viewers view reviews" ON public.access_review_cycles
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = access_review_cycles.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('viewer', 'legal_hold_manager'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Viewers view decisions' AND tablename = 'access_review_decisions') THEN
    CREATE POLICY "Viewers view decisions" ON public.access_review_decisions
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = (SELECT workspace_id FROM public.access_review_cycles WHERE id = access_review_decisions.cycle_id) 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('viewer', 'legal_hold_manager'))
      );
  END IF;

  -- Key Rotations: viewer, legal_hold_manager
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Viewers view rotations' AND tablename = 'api_key_rotations') THEN
    CREATE POLICY "Viewers view rotations" ON public.api_key_rotations
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = api_key_rotations.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('viewer', 'legal_hold_manager'))
      );
  END IF;

  -- SLA Policies: viewer, member (Everyone should see SLA targets)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Members view policies' AND tablename = 'sla_policies') THEN
    CREATE POLICY "Members view policies" ON public.sla_policies
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = sla_policies.workspace_id 
                AND wm.user_id = auth.uid())
      );
  END IF;

  -- Retention Policies: viewer, legal_hold_manager
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Viewers view retention' AND tablename = 'retention_policies') THEN
    CREATE POLICY "Viewers view retention" ON public.retention_policies
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.workspace_members wm 
                WHERE wm.workspace_id = retention_policies.workspace_id 
                AND wm.user_id = auth.uid() 
                AND wm.role IN ('viewer', 'legal_hold_manager'))
      );
  END IF;

END $$;


-- 5. Audit Trigger (Hardened)
CREATE OR REPLACE FUNCTION public.audit_member_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  -- Determine actor: auth.uid() or NULL (system)
  v_actor_id := auth.uid();

  IF (TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role) THEN
    INSERT INTO public.audit_logs (
      workspace_id, 
      actor_id, 
      action, 
      target_resource, 
      details
    ) VALUES (
      NEW.workspace_id, 
      v_actor_id, -- Can be NULL
      'role_change', 
      'workspace_member', 
      jsonb_build_object(
        'target_user_id', NEW.user_id, 
        'old_role', OLD.role, 
        'new_role', NEW.role,
        'system_initiated', (v_actor_id IS NULL)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_role_change ON public.workspace_members;
CREATE TRIGGER trg_audit_role_change
  AFTER UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_member_role_change();
