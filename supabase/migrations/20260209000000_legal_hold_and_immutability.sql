-- Migration: Legal Hold and Strict Immutability (Tier 1)
-- Description: Enforces strict append-only semantics for evidence, with a controlled exception for raw_body retention pruning.
--              Introduces legal hold mechanism to block deletions.

-- 1. Legal Hold Table
CREATE TABLE IF NOT EXISTS public.workspace_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_workspace_legal_holds_workspace_active
  ON public.workspace_legal_holds(workspace_id)
  WHERE active = true;

ALTER TABLE public.workspace_legal_holds ENABLE ROW LEVEL SECURITY;

-- RLS: Owners can create/view, Admins can view
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owners manage legal holds' AND tablename = 'workspace_legal_holds') THEN
    CREATE POLICY "Owners manage legal holds" ON public.workspace_legal_holds
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_legal_holds.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'owner'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_legal_holds.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'owner'
        )
      );
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins view legal holds' AND tablename = 'workspace_legal_holds') THEN
    CREATE POLICY "Admins view legal holds" ON public.workspace_legal_holds
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = workspace_legal_holds.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'admin'
        )
      );
  END IF;
END $$;


-- 2. Legal Hold Check Function
CREATE OR REPLACE FUNCTION public.check_legal_hold(check_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Must run as owner to bypass RLS during automated checks if needed
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_legal_holds
    WHERE workspace_id = check_workspace_id
    AND active = true
  );
END;
$$;


-- 3. Immutability Enforcement Function
CREATE OR REPLACE FUNCTION public.prevent_evidence_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Exception: Allowed to prune raw_body (set to NULL) ONLY IF conditions met
  IF (OLD.raw_body IS NOT NULL AND NEW.raw_body IS NULL) THEN
    
    -- 1. Ensure NO OTHER columns changed.
    IF (to_jsonb(NEW) - 'raw_body') IS DISTINCT FROM (to_jsonb(OLD) - 'raw_body') THEN
      RAISE EXCEPTION 'Evidence is immutable';
    END IF;
    
    -- Condition A: Expires At must be in the past
    IF (OLD.raw_body_expires_at IS NULL OR OLD.raw_body_expires_at > now()) THEN
       RAISE EXCEPTION 'Retention not met';
    END IF;

    -- Condition B: No Active Legal Hold
    IF public.check_legal_hold(OLD.workspace_id) THEN
       RAISE EXCEPTION 'Cannot delete evidence under legal hold';
    END IF;

    -- If we got here, allow the change (raw_body -> NULL)
    RETURN NEW;
  END IF;

  -- Block any other update
  RAISE EXCEPTION 'Evidence is immutable';
END;
$$;


-- 4. Trigger: Prevent Update on ingested_events
DROP TRIGGER IF EXISTS trg_prevent_evidence_update ON public.ingested_events;
CREATE TRIGGER trg_prevent_evidence_update
  BEFORE UPDATE ON public.ingested_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_evidence_update();


-- 5. Trigger: Check Legal Hold on DELETE (Generic for tables with workspace_id)
CREATE OR REPLACE FUNCTION public.enforce_legal_hold_on_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.check_legal_hold(OLD.workspace_id) THEN
    RAISE EXCEPTION 'Cannot delete evidence under legal hold';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_legal_hold ON public.ingested_events;
CREATE TRIGGER trg_check_legal_hold
  BEFORE DELETE ON public.ingested_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_legal_hold_on_delete();

DROP TRIGGER IF EXISTS trg_check_legal_hold ON public.certificates;
CREATE TRIGGER trg_check_legal_hold
  BEFORE DELETE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_legal_hold_on_delete();


-- 6. Trigger: Check Legal Hold on DELETE (Specific for verification_history)
CREATE OR REPLACE FUNCTION public.enforce_legal_hold_on_verification_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_workspace_id uuid;
BEGIN
  -- Look up workspace_id via ingested_event
  SELECT workspace_id INTO target_workspace_id
  FROM public.ingested_events
  WHERE id = OLD.ingested_event_id;

  -- If event is already gone, maybe legal hold check is moot? 
  -- Or strictly, if we can't find it, we assume no hold? 
  -- Safer: If linked event exists, check its workspace.
  IF target_workspace_id IS NOT NULL THEN
    IF public.check_legal_hold(target_workspace_id) THEN
      RAISE EXCEPTION 'Cannot delete evidence under legal hold';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_legal_hold ON public.verification_history;
CREATE TRIGGER trg_check_legal_hold
  BEFORE DELETE ON public.verification_history
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_legal_hold_on_verification_delete();
