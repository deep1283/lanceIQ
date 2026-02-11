-- =====================================================
-- Migration: RLS Policy Optimization
-- Fixes:
--   1. auth.uid() → (SELECT auth.uid()) for InitPlan caching
--   2. Scope roles: TO authenticated / TO service_role
--   3. Split FOR ALL → specific INSERT/UPDATE/DELETE
--   4. Consolidate overlapping SELECT policies
--
-- Tables NOT modified (already optimized):
--   sites, pro_users, user_subscriptions, webhook_events, webhook_queue
-- =====================================================

-- -------------------------------------------------------
-- WORKSPACES
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Access via membership" ON public.workspaces;
CREATE POLICY "Access via membership" ON public.workspaces
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspaces.id
    AND workspace_members.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Owners manage workspace" ON public.workspaces;
CREATE POLICY "Owners manage workspace" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspaces.id
    AND workspace_members.user_id = (SELECT auth.uid())
    AND workspace_members.role = 'owner'
  ));

DROP POLICY IF EXISTS "Owners delete workspace" ON public.workspaces;
CREATE POLICY "Owners delete workspace" ON public.workspaces
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = workspaces.id
    AND workspace_members.user_id = (SELECT auth.uid())
    AND workspace_members.role = 'owner'
  ));

-- -------------------------------------------------------
-- WORKSPACE_MEMBERS (split FOR ALL → specific commands)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Users see own memberships" ON public.workspace_members;
CREATE POLICY "Users see own memberships" ON public.workspace_members
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Owners manage members" ON public.workspace_members;
CREATE POLICY "Owners insert members" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (get_workspace_role(workspace_id) = 'owner');

CREATE POLICY "Owners update members" ON public.workspace_members
  FOR UPDATE TO authenticated
  USING (get_workspace_role(workspace_id) = 'owner');

CREATE POLICY "Owners delete members" ON public.workspace_members
  FOR DELETE TO authenticated
  USING (get_workspace_role(workspace_id) = 'owner');

-- -------------------------------------------------------
-- INGESTED_EVENTS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Access via workspace membership" ON public.ingested_events;
CREATE POLICY "Access via workspace membership" ON public.ingested_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = ingested_events.workspace_id
    AND workspace_members.user_id = (SELECT auth.uid())
  ));

-- -------------------------------------------------------
-- CERTIFICATES
-- P1 FIX: Removed "Users can insert own certificates" (no workspace check)
-- P2 FIX: Consolidated 3 SELECT → 1 combined policy
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Insert via workspace membership" ON public.certificates;
DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
DROP POLICY IF EXISTS "View legacy certs by owner" ON public.certificates;
DROP POLICY IF EXISTS "View via workspace membership" ON public.certificates;

-- Single INSERT: requires BOTH user_id match AND workspace membership
CREATE POLICY "Insert via workspace membership" ON public.certificates
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = certificates.workspace_id
      AND wm.user_id = (SELECT auth.uid())
    )
  );

-- Single SELECT: own certs OR via workspace membership (handles legacy + workspace)
CREATE POLICY "View own or workspace certificates" ON public.certificates
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = certificates.workspace_id
      AND wm.user_id = (SELECT auth.uid())
    )
  );

-- -------------------------------------------------------
-- VERIFICATION_HISTORY (TO authenticated — verified uses service_role)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Access own or via workspace" ON public.verification_history;
CREATE POLICY "Access own or via workspace" ON public.verification_history
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM ingested_events ie
      JOIN workspace_members wm ON wm.workspace_id = ie.workspace_id
      WHERE ie.id = verification_history.ingested_event_id
      AND wm.user_id = (SELECT auth.uid())
    )
  );

-- -------------------------------------------------------
-- SUBSCRIPTIONS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Workspace members can view subscriptions" ON public.subscriptions;
CREATE POLICY "Workspace members can view subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_members.workspace_id FROM workspace_members
    WHERE workspace_members.user_id = (SELECT auth.uid())
  ));

-- -------------------------------------------------------
-- AUDIT_LOGS (scope: owner/admin on team plan — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners and Admins view audit logs" ON public.audit_logs;
CREATE POLICY "Owners and Admins view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = audit_logs.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
    AND w.plan = 'team'
  ));

-- -------------------------------------------------------
-- ALERT_DELIVERIES (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners and Admins view alert deliveries" ON public.alert_deliveries;
CREATE POLICY "Owners and Admins view alert deliveries" ON public.alert_deliveries
  FOR SELECT TO authenticated
  USING (get_workspace_role(workspace_id) IN ('owner', 'admin'));

-- -------------------------------------------------------
-- WORKSPACE_ALERT_SETTINGS (split FOR ALL, scope preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Access alert settings via membership" ON public.workspace_alert_settings;
CREATE POLICY "Access alert settings via membership" ON public.workspace_alert_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = workspace_alert_settings.workspace_id
    AND wm.user_id = (SELECT auth.uid()) AND w.plan = 'team'
  ));

DROP POLICY IF EXISTS "Members can create alert settings" ON public.workspace_alert_settings;
CREATE POLICY "Members can create alert settings" ON public.workspace_alert_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.workspace_id = workspace_alert_settings.workspace_id
      AND wm.user_id = (SELECT auth.uid()) AND w.plan = 'team'
    )
  );

DROP POLICY IF EXISTS "Owners manage alert settings" ON public.workspace_alert_settings;
CREATE POLICY "Owners update alert settings" ON public.workspace_alert_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = workspace_alert_settings.workspace_id
    AND wm.user_id = (SELECT auth.uid()) AND wm.role = 'owner' AND w.plan = 'team'
  ));

CREATE POLICY "Owners delete alert settings" ON public.workspace_alert_settings
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = workspace_alert_settings.workspace_id
    AND wm.user_id = (SELECT auth.uid()) AND wm.role = 'owner' AND w.plan = 'team'
  ));

-- -------------------------------------------------------
-- WORKSPACE_USAGE_PERIODS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners view usage" ON public.workspace_usage_periods;
CREATE POLICY "Owners view usage" ON public.workspace_usage_periods
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_usage_periods.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

-- -------------------------------------------------------
-- TIMESTAMP_RECEIPTS (scope: all members view, service_role insert — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Members view receipts" ON public.timestamp_receipts;
CREATE POLICY "Members view receipts" ON public.timestamp_receipts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = timestamp_receipts.workspace_id
    AND wm.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Service role inserts receipts" ON public.timestamp_receipts;
CREATE POLICY "Service role inserts receipts" ON public.timestamp_receipts
  FOR INSERT TO service_role
  WITH CHECK (true);

-- -------------------------------------------------------
-- PROFILES
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

-- -------------------------------------------------------
-- SSO_PROVIDERS (scope: owner/admin/viewer/legal_hold_manager — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view SSO" ON public.sso_providers;
DROP POLICY IF EXISTS "Owners/Admins manage SSO" ON public.sso_providers;
DROP POLICY IF EXISTS "Service Role manages SSO" ON public.sso_providers;
DROP POLICY IF EXISTS "Viewers view SSO" ON public.sso_providers;

CREATE POLICY "Authorized members view SSO" ON public.sso_providers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sso_providers.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'viewer', 'legal_hold_manager')
  ));

CREATE POLICY "Owners/Admins insert SSO" ON public.sso_providers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sso_providers.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins update SSO" ON public.sso_providers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sso_providers.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins delete SSO" ON public.sso_providers
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sso_providers.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages SSO" ON public.sso_providers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- IDENTITY_MAPPINGS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view mappings" ON public.identity_mappings;
DROP POLICY IF EXISTS "Service Role manages mappings" ON public.identity_mappings;

CREATE POLICY "Owners/Admins view mappings" ON public.identity_mappings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = identity_mappings.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages mappings" ON public.identity_mappings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- SCIM_TOKENS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view SCIM tokens" ON public.scim_tokens;
DROP POLICY IF EXISTS "Service Role manages SCIM tokens" ON public.scim_tokens;

CREATE POLICY "Owners/Admins view SCIM tokens" ON public.scim_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = scim_tokens.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages SCIM tokens" ON public.scim_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- ACCESS_REVIEW_CYCLES (scope: owner/admin/viewer/legal_hold_manager — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins manage reviews" ON public.access_review_cycles;
DROP POLICY IF EXISTS "Service Role manages reviews" ON public.access_review_cycles;
DROP POLICY IF EXISTS "Viewers view reviews" ON public.access_review_cycles;

CREATE POLICY "Authorized members view reviews" ON public.access_review_cycles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = access_review_cycles.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'viewer', 'legal_hold_manager')
  ));

CREATE POLICY "Owners/Admins insert reviews" ON public.access_review_cycles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = access_review_cycles.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins update reviews" ON public.access_review_cycles
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = access_review_cycles.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins delete reviews" ON public.access_review_cycles
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = access_review_cycles.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages reviews" ON public.access_review_cycles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- ACCESS_REVIEW_DECISIONS (scope: owner/admin/viewer/legal_hold_manager — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins manage decisions" ON public.access_review_decisions;
DROP POLICY IF EXISTS "Service Role manages decisions" ON public.access_review_decisions;
DROP POLICY IF EXISTS "Viewers view decisions" ON public.access_review_decisions;

CREATE POLICY "Authorized members view decisions" ON public.access_review_decisions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = (
      SELECT access_review_cycles.workspace_id FROM access_review_cycles
      WHERE access_review_cycles.id = access_review_decisions.cycle_id
    ) AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'viewer', 'legal_hold_manager')
  ));

CREATE POLICY "Owners/Admins insert decisions" ON public.access_review_decisions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = (
      SELECT access_review_cycles.workspace_id FROM access_review_cycles
      WHERE access_review_cycles.id = access_review_decisions.cycle_id
    ) AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins update decisions" ON public.access_review_decisions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = (
      SELECT access_review_cycles.workspace_id FROM access_review_cycles
      WHERE access_review_cycles.id = access_review_decisions.cycle_id
    ) AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins delete decisions" ON public.access_review_decisions
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = (
      SELECT access_review_cycles.workspace_id FROM access_review_cycles
      WHERE access_review_cycles.id = access_review_decisions.cycle_id
    ) AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages decisions" ON public.access_review_decisions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- API_KEY_ROTATIONS (scope: owner/admin/viewer/legal_hold_manager — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view rotations" ON public.api_key_rotations;
DROP POLICY IF EXISTS "Service Role inserts rotations" ON public.api_key_rotations;
DROP POLICY IF EXISTS "Viewers view rotations" ON public.api_key_rotations;

CREATE POLICY "Authorized members view rotations" ON public.api_key_rotations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = api_key_rotations.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'viewer', 'legal_hold_manager')
  ));

CREATE POLICY "Service Role inserts rotations" ON public.api_key_rotations
  FOR INSERT TO service_role
  WITH CHECK (true);

-- -------------------------------------------------------
-- SLA_POLICIES (scope: members view + owner/admin mutate — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Members view policies" ON public.sla_policies;
DROP POLICY IF EXISTS "Owners/Admins manage policies" ON public.sla_policies;

CREATE POLICY "Members view policies" ON public.sla_policies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sla_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Owners/Admins insert policies" ON public.sla_policies
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sla_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins update policies" ON public.sla_policies
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sla_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins delete policies" ON public.sla_policies
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = sla_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

-- -------------------------------------------------------
-- INCIDENT_REPORTS (scope: members view + service_role mutate — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Members view incidents" ON public.incident_reports;
DROP POLICY IF EXISTS "Service Role manages incidents" ON public.incident_reports;

CREATE POLICY "Members view incidents" ON public.incident_reports
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = incident_reports.workspace_id
      AND wm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Service Role manages incidents" ON public.incident_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- WORKSPACE_LEGAL_HOLDS (scope: per-role — preserved exactly)
-- Original: owners=ALL, admins=view+deactivate, managers=create, staff=view
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners manage legal holds" ON public.workspace_legal_holds;
DROP POLICY IF EXISTS "Admins view legal holds" ON public.workspace_legal_holds;
DROP POLICY IF EXISTS "Managers create legal holds" ON public.workspace_legal_holds;
DROP POLICY IF EXISTS "Admins deactivate legal holds" ON public.workspace_legal_holds;
DROP POLICY IF EXISTS "Staff view legal holds" ON public.workspace_legal_holds;

-- Consolidated SELECT: all workspace roles that had view access
CREATE POLICY "Authorized members view legal holds" ON public.workspace_legal_holds
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_legal_holds.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'member', 'viewer', 'exporter', 'legal_hold_manager')
  ));

-- INSERT: owner + legal_hold_manager
CREATE POLICY "Owners/Managers create legal holds" ON public.workspace_legal_holds
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_legal_holds.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'legal_hold_manager')
  ));

-- UPDATE: owner (full), admin (deactivate only)
CREATE POLICY "Owners/Admins update legal holds" ON public.workspace_legal_holds
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_legal_holds.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ))
  WITH CHECK (
    active = false
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_legal_holds.workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role = 'owner'
    )
  );

-- DELETE: owner only
CREATE POLICY "Owners delete legal holds" ON public.workspace_legal_holds
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_legal_holds.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role = 'owner'
  ));

-- -------------------------------------------------------
-- RETENTION_POLICIES (scope: owner/admin/viewer/legal_hold_manager — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins manage retention" ON public.retention_policies;
DROP POLICY IF EXISTS "Service Role manages retention" ON public.retention_policies;
DROP POLICY IF EXISTS "Viewers view retention" ON public.retention_policies;

CREATE POLICY "Authorized members view retention" ON public.retention_policies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = retention_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'viewer', 'legal_hold_manager')
  ));

CREATE POLICY "Owners/Admins insert retention" ON public.retention_policies
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = retention_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins update retention" ON public.retention_policies
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = retention_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins delete retention" ON public.retention_policies
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = retention_policies.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages retention" ON public.retention_policies
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- RETENTION_JOBS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view retention" ON public.retention_jobs;
DROP POLICY IF EXISTS "Service Role manages retention jobs" ON public.retention_jobs;

CREATE POLICY "Owners/Admins view retention jobs" ON public.retention_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = retention_jobs.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages retention jobs" ON public.retention_jobs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- RETENTION_EXECUTIONS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view executions" ON public.retention_executions;
DROP POLICY IF EXISTS "Service Role manages executions" ON public.retention_executions;

CREATE POLICY "Owners/Admins view executions" ON public.retention_executions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = retention_executions.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages executions" ON public.retention_executions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- LEGAL_HOLD_AUTOMATION_RULES (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins manage automation" ON public.legal_hold_automation_rules;
DROP POLICY IF EXISTS "Service Role manages automation" ON public.legal_hold_automation_rules;

CREATE POLICY "Owners/Admins view automation rules" ON public.legal_hold_automation_rules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = legal_hold_automation_rules.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins insert automation rules" ON public.legal_hold_automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = legal_hold_automation_rules.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins update automation rules" ON public.legal_hold_automation_rules
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = legal_hold_automation_rules.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners/Admins delete automation rules" ON public.legal_hold_automation_rules
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = legal_hold_automation_rules.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages automation rules" ON public.legal_hold_automation_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- LEGAL_HOLD_AUTOMATION_EVENTS (scope: owner/admin view — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view automation events" ON public.legal_hold_automation_events;
DROP POLICY IF EXISTS "Service Role inserts events" ON public.legal_hold_automation_events;

CREATE POLICY "Owners/Admins view automation events" ON public.legal_hold_automation_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = legal_hold_automation_events.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages automation events" ON public.legal_hold_automation_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- REPLICATION_CONFIGS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view replication config" ON public.replication_configs;
DROP POLICY IF EXISTS "Service Role manages replication config" ON public.replication_configs;

CREATE POLICY "Owners/Admins view replication config" ON public.replication_configs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = replication_configs.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages replication config" ON public.replication_configs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- REPLICATION_STATUS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view replication status" ON public.replication_status;
DROP POLICY IF EXISTS "Service Role manages replication status" ON public.replication_status;

CREATE POLICY "Owners/Admins view replication status" ON public.replication_status
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = (
      SELECT replication_configs.workspace_id FROM replication_configs
      WHERE replication_configs.id = replication_status.replication_config_id
    ) AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages replication status" ON public.replication_status
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- ACCESS_REVIEW_SCHEDULES (scope: owner/admin/viewer/legal_hold_manager — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view review schedules" ON public.access_review_schedules;
DROP POLICY IF EXISTS "Service Role manages review schedules" ON public.access_review_schedules;
DROP POLICY IF EXISTS "Viewers view review schedules" ON public.access_review_schedules;

CREATE POLICY "Authorized members view review schedules" ON public.access_review_schedules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = access_review_schedules.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'viewer', 'legal_hold_manager')
  ));

CREATE POLICY "Service Role manages review schedules" ON public.access_review_schedules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- ACCESS_REVIEW_NOTIFICATIONS (scope: owner/admin/viewer/legal_hold_manager — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view review notifications" ON public.access_review_notifications;
DROP POLICY IF EXISTS "Service Role manages review notifications" ON public.access_review_notifications;
DROP POLICY IF EXISTS "Viewers view review notifications" ON public.access_review_notifications;

CREATE POLICY "Authorized members view review notifications" ON public.access_review_notifications
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = access_review_notifications.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin', 'viewer', 'legal_hold_manager')
  ));

CREATE POLICY "Service Role manages review notifications" ON public.access_review_notifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- RUNBOOK_CHECKS (scope: preserved exactly)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Members view global checks" ON public.runbook_checks;
DROP POLICY IF EXISTS "Owners/Admins manage workspace checks" ON public.runbook_checks;
DROP POLICY IF EXISTS "Service Role manages checks" ON public.runbook_checks;

CREATE POLICY "Members view global checks" ON public.runbook_checks
  FOR SELECT TO authenticated
  USING (
    (workspace_id IS NULL AND EXISTS (
      SELECT 1 FROM workspace_members wm WHERE wm.user_id = (SELECT auth.uid())
    ))
    OR
    (workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = runbook_checks.workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role IN ('owner', 'admin')
    ))
  );

CREATE POLICY "Owners/Admins insert workspace checks" ON public.runbook_checks
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = runbook_checks.workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners/Admins update workspace checks" ON public.runbook_checks
  FOR UPDATE TO authenticated
  USING (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = runbook_checks.workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners/Admins delete workspace checks" ON public.runbook_checks
  FOR DELETE TO authenticated
  USING (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = runbook_checks.workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service Role manages checks" ON public.runbook_checks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- RUNBOOK_CHECK_RESULTS (scope: preserved exactly)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Members view check results_new" ON public.runbook_check_results;
DROP POLICY IF EXISTS "Service Role manages results" ON public.runbook_check_results;

CREATE POLICY "Members view check results" ON public.runbook_check_results
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM runbook_checks c
    WHERE c.id = runbook_check_results.check_id
    AND (
      (c.workspace_id IS NULL AND EXISTS (
        SELECT 1 FROM workspace_members wm WHERE wm.user_id = (SELECT auth.uid())
      ))
      OR EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = c.workspace_id
        AND wm.user_id = (SELECT auth.uid())
        AND wm.role IN ('owner', 'admin')
      )
    )
  ));

CREATE POLICY "Service Role manages results" ON public.runbook_check_results
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- INGEST_BATCHES (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view batches" ON public.ingest_batches;
DROP POLICY IF EXISTS "Service Role manages batches" ON public.ingest_batches;

CREATE POLICY "Owners/Admins view batches" ON public.ingest_batches
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = ingest_batches.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages batches" ON public.ingest_batches
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- WORKSPACE_INGEST_COUNTERS (scope: owner/admin — preserved)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Owners/Admins view counters" ON public.workspace_ingest_counters;
DROP POLICY IF EXISTS "Service Role manages counters" ON public.workspace_ingest_counters;

CREATE POLICY "Owners/Admins view counters" ON public.workspace_ingest_counters
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_ingest_counters.workspace_id
    AND wm.user_id = (SELECT auth.uid())
    AND wm.role IN ('owner', 'admin')
  ));

CREATE POLICY "Service Role manages counters" ON public.workspace_ingest_counters
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
