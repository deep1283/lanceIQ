import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import SettingsClient from './client';
import { canManageWorkspace, isLegalHoldManager, isViewer } from '@/lib/roles';
import { computeUptime } from '@/lib/sla/compute';

export const dynamic = 'force-dynamic';

type AuditLog = {
  id: string;
  action: string;
  actor_id: string | null;
  target_resource: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type SsoProvider = {
  id: string;
  domain: string;
  metadata_xml: string | null;
  enabled: boolean | null;
  created_at: string;
  updated_at: string;
};

type ScimToken = {
  id: string;
  provider_id: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
};

type AccessReviewCycle = {
  id: string;
  reviewer_id: string | null;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

type AccessReviewDecision = {
  id: string;
  cycle_id: string;
  target_user_id: string | null;
  decision: string | null;
  notes: string | null;
  reviewed_at: string | null;
};

type KeyRotation = {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  key_type: string | null;
  rotated_at: string | null;
  reason: string | null;
  old_key_hash_hint: string | null;
};

type Incident = {
  id: string;
  workspace_id: string | null;
  title: string;
  severity: string | null;
  status: string | null;
  started_at: string;
  resolved_at: string | null;
  affected_components: string[] | null;
  public_note: string | null;
  created_at: string;
};

type SlaPolicy = {
  id: string;
  name: string;
  target_availability: number | null;
  violation_penalty_rate: number | null;
  created_at: string;
};

type SlaSummary = {
  workspace_id: string;
  window_start: string;
  window_end: string;
  uptime_percent: number;
  downtime_seconds: number;
  policies: SlaPolicy[];
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get the first workspace for the user (Simplification for MVP)
  // In a multi-workspace app, this would come from the URL or session context
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership) {
    // No workspace? Redirect to onboarding or dashboard
    redirect('/dashboard');
  }

  const currentUserRole = membership.role ?? null;
  const canManage = canManageWorkspace(currentUserRole);
  const canViewSso = canManage || isViewer(currentUserRole) || isLegalHoldManager(currentUserRole);
  const canViewAccessReviews = canManage || isViewer(currentUserRole) || isLegalHoldManager(currentUserRole);
  const canViewRotations = canManage || isViewer(currentUserRole) || isLegalHoldManager(currentUserRole);

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, plan, subscription_status, raw_body_retention_days')
    .eq('id', membership.workspace_id)
    .single();

  if (!workspace) {
     redirect('/dashboard');
  }

  // Get existing alert settings
  const { data: alertSettings } = await supabase
    .from('workspace_alert_settings')
    .select('*')
    .eq('workspace_id', workspace.id)
    .maybeSingle();

  // Get audit logs (Team only)
  let auditLogs: AuditLog[] | null = null;
  let members: any[] | null = null;

  if (workspace.plan === 'team') {
    const { data: logsData } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(50);
    auditLogs = logsData || [];

    // Fetch members using RPC
    const { data: membersData } = await supabase
      .rpc('get_workspace_members', { lookup_workspace_id: workspace.id });
    members = membersData || [];
  }

  let ssoProviders: SsoProvider[] = [];
  if (canViewSso) {
    const { data } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    ssoProviders = data || [];
  }

  let scimTokens: ScimToken[] = [];
  if (canManage) {
    const { data } = await supabase
      .from('scim_tokens')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    scimTokens = data || [];
  }

  let accessReviewCycles: AccessReviewCycle[] = [];
  let accessReviewDecisions: AccessReviewDecision[] = [];
  if (canViewAccessReviews) {
    const { data: cycles } = await supabase
      .from('access_review_cycles')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    accessReviewCycles = cycles || [];

    const cycleIds = accessReviewCycles.map((cycle) => cycle.id);
    if (cycleIds.length) {
      const { data: decisions } = await supabase
        .from('access_review_decisions')
        .select('*')
        .in('cycle_id', cycleIds)
        .order('reviewed_at', { ascending: false });
      accessReviewDecisions = decisions || [];
    }
  }

  let keyRotations: KeyRotation[] = [];
  if (canViewRotations) {
    const { data } = await supabase
      .from('api_key_rotations')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('rotated_at', { ascending: false });
    keyRotations = data || [];
  }

  let initialIncidents: Incident[] = [];
  const { data: incidentsData } = await supabase
    .from('incident_reports')
    .select('*')
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
    .order('started_at', { ascending: false })
    .limit(50);
  initialIncidents = incidentsData || [];

  let initialSlaSummary: SlaSummary | null = null;
  const windowDays = 30;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const { data: slaPolicies } = await supabase
    .from('sla_policies')
    .select('*')
    .eq('workspace_id', workspace.id);
  const { data: slaIncidents } = await supabase
    .from('incident_reports')
    .select('started_at, resolved_at')
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
    .gte('started_at', windowStart.toISOString());
  const { uptimePercent, downtimeSeconds } = computeUptime({
    incidents: slaIncidents || [],
    windowStart,
    windowEnd,
  });
  initialSlaSummary = {
    workspace_id: workspace.id,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    uptime_percent: uptimePercent,
    downtime_seconds: downtimeSeconds,
    policies: (slaPolicies || []) as SlaPolicy[],
  };

  return (
    <SettingsClient 
      workspace={workspace} 
      initialSettings={alertSettings} 
      initialAuditLogs={auditLogs || []}
      initialMembers={members || []}
      currentUserId={user.id}
      currentUserRole={currentUserRole}
      initialSsoProviders={ssoProviders}
      initialScimTokens={scimTokens}
      initialAccessReviewCycles={accessReviewCycles}
      initialAccessReviewDecisions={accessReviewDecisions}
      initialKeyRotations={keyRotations}
      initialIncidents={initialIncidents}
      initialSlaSummary={initialSlaSummary}
    />
  );
}
