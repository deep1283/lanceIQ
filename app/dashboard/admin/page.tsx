import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import AdminClient from './client';
import { canManageWorkspace, canViewAuditLogs, isLegalHoldManager, isViewer } from '@/lib/roles';
import { computeUptime } from '@/lib/sla/compute';
import { checkPlanEntitlements } from '@/app/actions/subscription';
import { cookies } from 'next/headers';
import { resolveWorkspaceContext } from '@/lib/workspace-context';

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

type LegalHoldStatus = {
  id: string;
  active: boolean | null;
  reason: string | null;
  created_at: string | null;
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

type RetentionJob = {
  id: string;
  workspace_id: string;
  scope: string;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  status: string | null;
  error_summary: string | null;
  created_at: string;
};

type RetentionExecution = {
  id: string;
  job_id: string | null;
  workspace_id: string;
  scope: string;
  rows_pruned: number;
  rows_blocked_by_hold: number;
  proof_hash: string | null;
  executed_at: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ workspace_id?: string }>;
} = {}) {
  const params = searchParams ? await searchParams : undefined;
  const workspaceIdHint = params?.workspace_id ?? null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const workspaceIdCookie = cookieStore.get('lanceiq_workspace_id')?.value ?? null;
  const context = await resolveWorkspaceContext({
    supabase,
    userId: user.id,
    workspaceIdHint,
    workspaceIdCookie,
  });

  if (!context) {
    redirect('/dashboard');
  }

  const workspace = {
    id: context.workspace.id,
    name: context.workspace.name ?? 'Workspace',
    plan: (context.workspace.plan === 'team' || context.workspace.plan === 'pro' ? context.workspace.plan : 'free') as
      | 'free'
      | 'pro'
      | 'team',
    subscription_status: context.workspace.subscription_status ?? 'free',
    raw_body_retention_days: context.workspace.raw_body_retention_days ?? 0,
  };

  const currentUserRole = context.role ?? null;
  const canManage = canManageWorkspace(currentUserRole);
  const canViewSso = canManage || isViewer(currentUserRole) || isLegalHoldManager(currentUserRole);
  const canViewAccessReviews = canManage || isViewer(currentUserRole) || isLegalHoldManager(currentUserRole);

  const entitlements = await checkPlanEntitlements(workspace.id);

  const canViewAuditLogsRole = canViewAuditLogs(currentUserRole);
  const canViewLegalHoldRole = canManage || isLegalHoldManager(currentUserRole);
  const canViewOpsRole = Boolean(currentUserRole);

  const canLoadAlerts = canManage && entitlements.canUseAlerts;
  const canLoadAuditLogs = canViewAuditLogsRole && entitlements.canViewAuditLogs;
  const canLoadMembers = canManage && entitlements.canViewAuditLogs;
  const canLoadSso = canViewSso && entitlements.canUseSso;
  const canLoadScim = canManage && entitlements.canUseScim;
  const canLoadAccessReviews = canViewAccessReviews && entitlements.canUseAccessReviews;
  const canLoadLegalHold = canViewLegalHoldRole && entitlements.canUseLegalHold;
  const canLoadOps = canViewOpsRole && entitlements.canUseSlaIncidents;
  const canLoadRetention = canManage && entitlements.canUseSlaIncidents;

  let alertSettings: any = null;
  if (canLoadAlerts) {
    const { data } = await supabase
      .from('workspace_alert_settings')
      .select('*')
      .eq('workspace_id', workspace.id)
      .maybeSingle();
    alertSettings = data || null;
  }

  let auditLogs: AuditLog[] | null = null;
  let members: any[] | null = null;

  if (canLoadAuditLogs) {
    const { data: logsData } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(50);
    auditLogs = logsData || [];
  }

  if (canLoadMembers) {
    const { data: membersData } = await supabase
      .rpc('get_workspace_members', { lookup_workspace_id: workspace.id });
    members = membersData || [];
  }

  let ssoProviders: SsoProvider[] = [];
  if (canLoadSso) {
    const { data } = await supabase
      .from('sso_providers')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    ssoProviders = data || [];
  }

  let scimTokens: ScimToken[] = [];
  if (canLoadScim) {
    const { data } = await supabase
      .from('scim_tokens')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    scimTokens = data || [];
  }

  let accessReviewCycles: AccessReviewCycle[] = [];
  let accessReviewDecisions: AccessReviewDecision[] = [];
  if (canLoadAccessReviews) {
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

  let legalHold: LegalHoldStatus | null = null;
  if (canLoadLegalHold) {
    const { data: holds } = await supabase
      .from('workspace_legal_holds')
      .select('id, active, reason, created_at')
      .eq('workspace_id', workspace.id)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    legalHold = Array.isArray(holds) && holds.length > 0 ? holds[0] : null;
  }

  let initialIncidents: Incident[] = [];
  if (canLoadOps) {
    const { data: incidentsData } = await supabase
      .from('incident_reports')
      .select('*')
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .order('started_at', { ascending: false })
      .limit(50);
    initialIncidents = incidentsData || [];
  }

  let initialSlaSummary: SlaSummary | null = null;
  if (canLoadOps) {
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
  }

  let retentionJobs: RetentionJob[] = [];
  let retentionExecutions: RetentionExecution[] = [];
  if (canLoadRetention) {
    const { data: jobsData } = await supabase
      .from('retention_jobs')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('scheduled_at', { ascending: false })
      .limit(50);
    retentionJobs = jobsData || [];

    const { data: executionData } = await supabase
      .from('retention_executions')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('executed_at', { ascending: false })
      .limit(50);
    retentionExecutions = executionData || [];
  }

  return (
    <AdminClient
      workspace={workspace}
      initialEntitlements={entitlements}
      initialSettings={alertSettings}
      initialAuditLogs={auditLogs || []}
      initialMembers={members || []}
      currentUserId={user.id}
      currentUserRole={currentUserRole}
      initialSsoProviders={ssoProviders}
      initialScimTokens={scimTokens}
      initialAccessReviewCycles={accessReviewCycles}
      initialAccessReviewDecisions={accessReviewDecisions}
      initialLegalHold={legalHold}
      initialIncidents={initialIncidents}
      initialSlaSummary={initialSlaSummary}
      initialRetentionJobs={retentionJobs}
      initialRetentionExecutions={retentionExecutions}
    />
  );
}
