-- Allow legacy certificates without workspace_id to remain visible to their owner
-- This prevents data loss if any rows were not backfilled.

DROP POLICY IF EXISTS "View legacy certs by owner" ON public.certificates;
CREATE POLICY "View legacy certs by owner" ON public.certificates
  FOR SELECT USING (
    workspace_id IS NULL
    AND user_id = auth.uid()
  );
