-- Enforce Team plan for multiple workspace members
CREATE OR REPLACE FUNCTION public.enforce_team_for_members()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ws_plan text;
  member_count int;
BEGIN
  SELECT plan INTO ws_plan FROM public.workspaces WHERE id = NEW.workspace_id;

  IF ws_plan IS NULL THEN
    RETURN NEW;
  END IF;

  IF ws_plan <> 'team' THEN
    SELECT COUNT(*) INTO member_count FROM public.workspace_members WHERE workspace_id = NEW.workspace_id;
    IF member_count >= 1 THEN
      RAISE EXCEPTION 'Team plan required for multiple members';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_team_members ON public.workspace_members;
CREATE TRIGGER trg_enforce_team_members
BEFORE INSERT ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_for_members();
