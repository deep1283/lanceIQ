-- Team-only gating for audit logs and alert settings

-- Audit Logs: restrict view to team plan
DROP POLICY IF EXISTS "Owners and Admins view audit logs" ON audit_logs;
CREATE POLICY "Owners and Admins view audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.workspace_id = audit_logs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
        AND w.plan = 'team'
    )
  );

-- Alert Settings: restrict to team plan
DROP POLICY IF EXISTS "Access alert settings via membership" ON workspace_alert_settings;
CREATE POLICY "Access alert settings via membership" ON workspace_alert_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.workspace_id = workspace_alert_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND w.plan = 'team'
    )
  );

DROP POLICY IF EXISTS "Members can create alert settings" ON workspace_alert_settings;
CREATE POLICY "Members can create alert settings" ON workspace_alert_settings
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.workspace_id = workspace_alert_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND w.plan = 'team'
    )
  );

DROP POLICY IF EXISTS "Owners manage alert settings" ON workspace_alert_settings;
CREATE POLICY "Owners manage alert settings" ON workspace_alert_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.workspace_id = workspace_alert_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
        AND w.plan = 'team'
    )
  );
