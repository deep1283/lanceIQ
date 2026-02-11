-- =====================================================
-- Migration: Foreign Key Indexes
-- 27 indexes on FK columns that were missing coverage
-- Safe: max table has 62 rows (verification_history)
-- =====================================================

-- access_review_cycles (0 rows)
CREATE INDEX IF NOT EXISTS idx_arc_reviewer_id ON public.access_review_cycles(reviewer_id);

-- access_review_decisions (0 rows)
CREATE INDEX IF NOT EXISTS idx_ard_target_user_id ON public.access_review_decisions(target_user_id);

-- access_review_notifications (0 rows)
CREATE INDEX IF NOT EXISTS idx_arn_workspace_id ON public.access_review_notifications(workspace_id);

-- alert_deliveries (5 rows)
CREATE INDEX IF NOT EXISTS idx_ad_alert_setting_id ON public.alert_deliveries(alert_setting_id);

-- api_key_rotations (0 rows)
CREATE INDEX IF NOT EXISTS idx_akr_actor_id ON public.api_key_rotations(actor_id);
CREATE INDEX IF NOT EXISTS idx_akr_workspace_id ON public.api_key_rotations(workspace_id);

-- audit_logs (3 rows)
CREATE INDEX IF NOT EXISTS idx_al_actor_id ON public.audit_logs(actor_id);

-- certificates (15 rows)
CREATE INDEX IF NOT EXISTS idx_cert_verified_by ON public.certificates(verified_by_user_id);

-- identity_mappings (0 rows)
CREATE INDEX IF NOT EXISTS idx_im_user_id ON public.identity_mappings(user_id);

-- incident_reports (0 rows)
CREATE INDEX IF NOT EXISTS idx_ir_workspace_id ON public.incident_reports(workspace_id);

-- ingest_batches (0 rows)
CREATE INDEX IF NOT EXISTS idx_ib_workspace_id ON public.ingest_batches(workspace_id);

-- legal_hold_automation_events (0 rows)
CREATE INDEX IF NOT EXISTS idx_lhae_rule_id ON public.legal_hold_automation_events(rule_id);
CREATE INDEX IF NOT EXISTS idx_lhae_workspace_id ON public.legal_hold_automation_events(workspace_id);

-- legal_hold_automation_rules (0 rows)
CREATE INDEX IF NOT EXISTS idx_lhar_workspace_id ON public.legal_hold_automation_rules(workspace_id);

-- retention_executions (0 rows)
CREATE INDEX IF NOT EXISTS idx_re_job_id ON public.retention_executions(job_id);

-- retention_jobs (0 rows)
CREATE INDEX IF NOT EXISTS idx_rj_workspace_id ON public.retention_jobs(workspace_id);

-- runbook_checks (0 rows)
CREATE INDEX IF NOT EXISTS idx_rc_workspace_id ON public.runbook_checks(workspace_id);

-- scim_tokens (0 rows)
CREATE INDEX IF NOT EXISTS idx_st_created_by ON public.scim_tokens(created_by);

-- sla_policies (0 rows)
CREATE INDEX IF NOT EXISTS idx_sp_workspace_id ON public.sla_policies(workspace_id);

-- timestamp_receipts (0 rows)
CREATE INDEX IF NOT EXISTS idx_tr_workspace_id ON public.timestamp_receipts(workspace_id);

-- verification_history (62 rows)
CREATE INDEX IF NOT EXISTS idx_vh_certificate_id ON public.verification_history(certificate_id);
CREATE INDEX IF NOT EXISTS idx_vh_ingested_event_id ON public.verification_history(ingested_event_id);

-- workspace_alert_settings (11 rows)
CREATE INDEX IF NOT EXISTS idx_was_created_by ON public.workspace_alert_settings(created_by);
CREATE INDEX IF NOT EXISTS idx_was_updated_by ON public.workspace_alert_settings(updated_by);

-- workspace_legal_holds (0 rows)
CREATE INDEX IF NOT EXISTS idx_wlh_created_by ON public.workspace_legal_holds(created_by);

-- workspace_members (2 rows)
CREATE INDEX IF NOT EXISTS idx_wm_user_id ON public.workspace_members(user_id);
