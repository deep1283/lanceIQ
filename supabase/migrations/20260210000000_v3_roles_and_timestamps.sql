-- Migration: V3 Time Credibility & Roles (Tier 1)
-- Description: Adds timestamp_receipts table (append-only) and expands workspace roles (viewer, exporter, legal_hold_manager).

-- 1. Expanded Roles
-- Methodology: Drop and re-add constraint to include new roles. 
-- Note: 'NOT VALID' is used to minimize locking, followed by 'VALIDATE CONSTRAINT'.
ALTER TABLE public.workspace_members 
  DROP CONSTRAINT IF EXISTS workspace_members_role_check;

ALTER TABLE public.workspace_members 
  ADD CONSTRAINT workspace_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'exporter', 'legal_hold_manager'))
  NOT VALID;

ALTER TABLE public.workspace_members 
  VALIDATE CONSTRAINT workspace_members_role_check;


-- 2. Time Credibility (Timestamp Receipts)
CREATE TABLE IF NOT EXISTS public.timestamp_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- The target being timestamped
  resource_type text NOT NULL CHECK (resource_type IN ('ingested_event', 'certificate', 'batch')),
  resource_id uuid NOT NULL,
  
  -- The hash that was anchored
  anchored_hash text NOT NULL,
  
  -- Proof details
  tsa_url text, -- Authority URL
  chain_name text, -- Blockchain name if applicable
  block_height bigint,
  transaction_id text NOT NULL, -- External txn ID (e.g., BTC txid)
  
  proof_data jsonb NOT NULL, -- Raw receipt
  
  created_at timestamptz DEFAULT now(),
  
  -- Allow multiple receipts for same resource (re-timestamping), but unique by external transaction
  UNIQUE(resource_type, resource_id, transaction_id)
);

-- Index for lookup by resource
CREATE INDEX IF NOT EXISTS idx_timestamp_receipts_resource 
  ON public.timestamp_receipts(resource_type, resource_id);

ALTER TABLE public.timestamp_receipts ENABLE ROW LEVEL SECURITY;

-- RLS: Read-only for all members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Members view receipts' AND tablename = 'timestamp_receipts') THEN
    CREATE POLICY "Members view receipts" ON public.timestamp_receipts
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = timestamp_receipts.workspace_id
          AND wm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- RLS: Service role can INSERT (system-driven stamping)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role inserts receipts' AND tablename = 'timestamp_receipts') THEN
    CREATE POLICY "Service role inserts receipts" ON public.timestamp_receipts
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- 2b. Workspace/Resource Integrity
CREATE OR REPLACE FUNCTION public.validate_timestamp_receipt_resource()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.resource_type = 'ingested_event' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ingested_events ie
      WHERE ie.id = NEW.resource_id
      AND ie.workspace_id = NEW.workspace_id
    ) THEN
      RAISE EXCEPTION 'Timestamp receipt resource does not match workspace';
    END IF;
  ELSIF NEW.resource_type = 'certificate' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.certificates c
      WHERE c.id = NEW.resource_id
      AND c.workspace_id = NEW.workspace_id
    ) THEN
      RAISE EXCEPTION 'Timestamp receipt resource does not match workspace';
    END IF;
  ELSIF NEW.resource_type = 'batch' THEN
    -- Batch resources are externally defined; no row-level validation.
    NULL;
  ELSE
    RAISE EXCEPTION 'Invalid resource_type for timestamp receipt';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_timestamp_receipt ON public.timestamp_receipts;
CREATE TRIGGER trg_validate_timestamp_receipt
  BEFORE INSERT ON public.timestamp_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_timestamp_receipt_resource();


-- 3. Immutability Enforcement (Append-Only)
CREATE OR REPLACE FUNCTION public.prevent_timestamp_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Timestamp receipts are immutable. Append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_timestamp_mod ON public.timestamp_receipts;
CREATE TRIGGER trg_prevent_timestamp_mod
  BEFORE UPDATE OR DELETE ON public.timestamp_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_timestamp_modification();


-- 4. Legal Hold Manager Powers
-- Goal: 'legal_hold_manager' can INSERT but NOT UPDATE/DELETE (except via policy logic, but here we use RLS).
-- Existing policies on 'workspace_legal_holds' give full access to 'owner'.
-- We add specific policies for the new role.

-- Policy: Legal Hold Mgr can CREATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Managers create legal holds' AND tablename = 'workspace_legal_holds') THEN
    CREATE POLICY "Managers create legal holds" ON public.workspace_legal_holds
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_legal_holds.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'legal_hold_manager'
        )
      );
  END IF;
END $$;

-- Policy: Admins can DEACTIVATE legal holds (only allow active=false)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins deactivate legal holds' AND tablename = 'workspace_legal_holds') THEN
    CREATE POLICY "Admins deactivate legal holds" ON public.workspace_legal_holds
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_legal_holds.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'admin'
        )
      )
      WITH CHECK (active = false);
  END IF;
END $$;

-- Policy: Managers (and Viewers/Exporters) can VIEW
-- Note: We need to ensure the existing 'Owners/Admins view' policy doesn't conflict or we just add a broad view policy.
-- The simplest way is to broaden the SELECT policy to all members, or add specific ones.
-- Current existing policy 'Admins view legal holds' covers admins.
-- Owners are covered by 'Owners manage legal holds' (ALL).
-- Let's add 'Members view legal holds' covering the rest.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff view legal holds' AND tablename = 'workspace_legal_holds') THEN
    CREATE POLICY "Staff view legal holds" ON public.workspace_legal_holds
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_legal_holds.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role IN ('member', 'viewer', 'exporter', 'legal_hold_manager')
        )
      );
  END IF;
END $$;
