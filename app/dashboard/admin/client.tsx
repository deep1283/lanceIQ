'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { updateAlertSettings } from '@/app/actions/alert-settings';
import { inviteMember, removeMember } from '@/app/actions/members';
import { createScimToken, revokeScimToken, saveSsoProvider } from '../settings/actions';
import type { Role } from '@/lib/roles';
import { canInviteMembers, canManageWorkspace, canRemoveMembers, canViewAuditLogs, isLegalHoldManager, isViewer } from '@/lib/roles';

interface Workspace {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'team';
  subscription_status: string;
  raw_body_retention_days: number;
}

interface AlertSetting {
  id?: string;
  channel: 'email' | 'slack' | 'webhook'; // Updated to match DB check constraint
  destination: string;
  enabled: boolean;
  window_minutes: number;
  critical_fail_count: number;
  updated_at?: string;
}

interface AuditLog {
  id: string;
  action: string;
  actor_id: string | null;
  target_resource: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface Member {
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}

interface SsoProvider {
  id: string;
  domain: string;
  metadata_xml: string | null;
  enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

interface ScimToken {
  id: string;
  provider_id: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
}

interface AccessReviewCycle {
  id: string;
  reviewer_id: string | null;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

interface AccessReviewDecision {
  id: string;
  cycle_id: string;
  target_user_id: string | null;
  decision: string | null;
  notes: string | null;
  reviewed_at: string | null;
}

interface LegalHoldStatus {
  id: string;
  active: boolean | null;
  reason: string | null;
  created_at: string | null;
}

interface Incident {
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
}

interface SlaPolicy {
  id: string;
  name: string;
  target_availability: number | null;
  violation_penalty_rate: number | null;
  created_at: string;
}

interface SlaSummary {
  workspace_id: string;
  window_start: string;
  window_end: string;
  uptime_percent: number;
  downtime_seconds: number;
  policies: SlaPolicy[];
}

interface RetentionJob {
  id: string;
  workspace_id: string;
  scope: string;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  status: string | null;
  error_summary: string | null;
  created_at: string;
}

interface RetentionExecution {
  id: string;
  job_id: string | null;
  workspace_id: string;
  scope: string;
  rows_pruned: number;
  rows_blocked_by_hold: number;
  proof_hash: string | null;
  executed_at: string;
}

interface ReplicationSummary {
  overall_status: string;
  max_lag_seconds: number | null;
  last_updated_at: string | null;
}

interface ReplicationRegion {
  config_id: string;
  region: string;
  mode: string;
  enabled: boolean;
  status: string;
  lag_seconds: number | null;
  updated_at: string | null;
  details: Record<string, unknown> | null;
}

interface ReplicationStatusResponse {
  workspace_id: string;
  summary: ReplicationSummary;
  regions: ReplicationRegion[];
}

interface RunbookResult {
  status: string | null;
  summary: string | null;
  executed_at: string | null;
}

interface RunbookCheck {
  id: string;
  workspace_id: string | null;
  check_type: string;
  status: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  latest_result: RunbookResult | null;
}

export default function SettingsClient({ 
  workspace, 
  initialSettings,
  initialAuditLogs,
  initialMembers,
  currentUserId,
  currentUserRole,
  initialSsoProviders,
  initialScimTokens,
  initialAccessReviewCycles,
  initialAccessReviewDecisions,
  initialLegalHold,
  initialIncidents,
  initialSlaSummary,
  initialRetentionJobs,
  initialRetentionExecutions
}: { 
  workspace: Workspace, 
  initialSettings: AlertSetting | null,
  initialAuditLogs: AuditLog[],
  initialMembers: Member[],
  currentUserId: string,
  currentUserRole: Role | null,
  initialSsoProviders: SsoProvider[],
  initialScimTokens: ScimToken[],
  initialAccessReviewCycles: AccessReviewCycle[],
  initialAccessReviewDecisions: AccessReviewDecision[],
  initialLegalHold: LegalHoldStatus | null,
  initialIncidents: Incident[],
  initialSlaSummary: SlaSummary | null,
  initialRetentionJobs: RetentionJob[],
  initialRetentionExecutions: RetentionExecution[]
}) {
  const router = useRouter();
  const isTeam = workspace.plan === 'team';
  const isPastDue = workspace.subscription_status === 'past_due';
  const canUseAlerts = isTeam && (workspace.subscription_status === 'active' || isPastDue);
  const canManage = canManageWorkspace(currentUserRole);
  const canViewAudit = canViewAuditLogs(currentUserRole);
  const canInvite = canInviteMembers(currentUserRole);
  const canRemove = canRemoveMembers(currentUserRole);
  const canViewSso = canManage || isViewer(currentUserRole) || isLegalHoldManager(currentUserRole);
  const canViewAccessReviews = canManage || isViewer(currentUserRole) || isLegalHoldManager(currentUserRole);
  const canViewLegalHold = canManage || isLegalHoldManager(currentUserRole);
  const canViewOps = Boolean(currentUserRole);

  type AdminTab = 'alerts' | 'audit' | 'legal' | 'members' | 'identity' | 'access' | 'ops';

  const availableTabs = [
    canManage ? 'alerts' : null,
    canViewAudit ? 'audit' : null,
    canViewLegalHold ? 'legal' : null,
    canManage ? 'members' : null,
    canViewSso ? 'identity' : null,
    canViewAccessReviews ? 'access' : null,
    canViewOps ? 'ops' : null,
  ].filter((tab): tab is AdminTab => Boolean(tab));

  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section');
  const initialTab = sectionParam && availableTabs.includes(sectionParam as AdminTab)
    ? (sectionParam as AdminTab)
    : (availableTabs[0] || 'alerts');

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  useEffect(() => {
    if (!sectionParam) return;
    const nextTab = availableTabs.includes(sectionParam as AdminTab)
      ? (sectionParam as AdminTab)
      : availableTabs[0];
    if (nextTab && nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [sectionParam, availableTabs, activeTab]);

  const [settings, setSettings] = useState<AlertSetting>(initialSettings || {
    channel: 'email',
    destination: '',
    enabled: true,
    window_minutes: 10,
    critical_fail_count: 3
  });
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [ssoForm, setSsoForm] = useState({
    providerId: null as string | null,
    domain: '',
    metadataXml: '',
    enabled: true,
  });
  const [ssoSaving, setSsoSaving] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoSuccess, setSsoSuccess] = useState<string | null>(null);

  const [selectedProviderId, setSelectedProviderId] = useState<string>(initialSsoProviders[0]?.id ?? '');
  const [scimCreating, setScimCreating] = useState(false);
  const [scimRevokingId, setScimRevokingId] = useState<string | null>(null);
  const [scimError, setScimError] = useState<string | null>(null);
  const [newScimToken, setNewScimToken] = useState<string | null>(null);

  const [accessPeriodStart, setAccessPeriodStart] = useState('');
  const [accessPeriodEnd, setAccessPeriodEnd] = useState('');
  const [accessCreating, setAccessCreating] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSuccess, setAccessSuccess] = useState<string | null>(null);

  const [includeGlobal, setIncludeGlobal] = useState(true);
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const incidentsLoadedRef = useRef(false);

  const [slaSummary, setSlaSummary] = useState<SlaSummary | null>(initialSlaSummary);
  const [slaRefreshing, setSlaRefreshing] = useState(false);
  const [slaError, setSlaError] = useState<string | null>(null);

  const [replicationStatus, setReplicationStatus] = useState<ReplicationStatusResponse | null>(null);
  const [replicationLoading, setReplicationLoading] = useState(false);
  const [replicationError, setReplicationError] = useState<string | null>(null);

  const [runbookChecks, setRunbookChecks] = useState<RunbookCheck[]>([]);
  const [runbookLoading, setRunbookLoading] = useState(false);
  const [runbookError, setRunbookError] = useState<string | null>(null);
  const runbookLoadedRef = useRef(false);
  const replicationLoadedRef = useRef(false);

  async function handleSave() {
    if (!canUseAlerts) return; // Strict gating
    setSaving(true);

    const payload = {
      workspace_id: workspace.id,
      ...settings,
      window_minutes: Number(settings.window_minutes),
      critical_fail_count: Number(settings.critical_fail_count)
    };

    const result = await updateAlertSettings(payload);

    if (result.error) {
      alert(result.error); // Simple error handling for now
    }
    
    setSaving(false);
    // Router refresh happens in server action via revalidatePath
    router.refresh();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) return;
    
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    const result = await inviteMember(inviteEmail, workspace.id);

    if (result.error) {
      setInviteError(result.error);
    } else {
      setInviteSuccess("Member added successfully!");
      setInviteEmail('');
      router.refresh();
    }
    setInviting(false);
  }

  async function handleRemove(userId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    
    const result = await removeMember(userId, workspace.id);
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  }

  useEffect(() => {
    if (!selectedProviderId && initialSsoProviders[0]?.id) {
      setSelectedProviderId(initialSsoProviders[0].id);
    }
  }, [initialSsoProviders, selectedProviderId]);

  async function loadReplicationStatus() {
    if (!canManage) return;
    setReplicationLoading(true);
    setReplicationError(null);
    try {
      const params = new URLSearchParams({ workspace_id: workspace.id });
      const res = await fetch(`/api/ops/replication/status?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load replication status.');
      }
      setReplicationStatus(data);
    } catch (error) {
      setReplicationError(error instanceof Error ? error.message : 'Failed to load replication status.');
    } finally {
      setReplicationLoading(false);
    }
  }

  async function loadRunbookChecks() {
    setRunbookLoading(true);
    setRunbookError(null);
    try {
      const params = new URLSearchParams({ workspace_id: workspace.id });
      const res = await fetch(`/api/ops/runbooks/checks?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load runbook checks.');
      }
      setRunbookChecks(data.checks || []);
    } catch (error) {
      setRunbookError(error instanceof Error ? error.message : 'Failed to load runbook checks.');
    } finally {
      setRunbookLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== 'ops') return;

    if (!runbookLoadedRef.current) {
      runbookLoadedRef.current = true;
      loadRunbookChecks();
    }

    if (!replicationLoadedRef.current && canManage) {
      replicationLoadedRef.current = true;
      loadReplicationStatus();
    }
  }, [activeTab, canManage, workspace.id]);

  useEffect(() => {
    if (!incidentsLoadedRef.current) {
      incidentsLoadedRef.current = true;
      return;
    }

    async function loadIncidents() {
      setIncidentsLoading(true);
      setIncidentsError(null);
      try {
        const params = new URLSearchParams({
          workspace_id: workspace.id,
          include_global: includeGlobal ? 'true' : 'false',
        });
        const res = await fetch(`/api/ops/incidents?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load incidents.');
        }
        setIncidents(data.incidents || []);
      } catch (error) {
        setIncidentsError(error instanceof Error ? error.message : 'Failed to load incidents.');
      } finally {
        setIncidentsLoading(false);
      }
    }

    loadIncidents();
  }, [includeGlobal, workspace.id]);

  async function handleSaveSsoProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;

    setSsoSaving(true);
    setSsoError(null);
    setSsoSuccess(null);

    const result = await saveSsoProvider({
      workspaceId: workspace.id,
      providerId: ssoForm.providerId,
      domain: ssoForm.domain,
      metadataXml: ssoForm.metadataXml,
      enabled: ssoForm.enabled,
    });

    if (result.error) {
      setSsoError(result.error);
    } else {
      setSsoSuccess(ssoForm.providerId ? 'SSO provider updated.' : 'SSO provider created.');
      setSsoForm({ providerId: null, domain: '', metadataXml: '', enabled: true });
      router.refresh();
    }

    setSsoSaving(false);
  }

  function startEditProvider(provider: SsoProvider) {
    setSsoError(null);
    setSsoSuccess(null);
    setSsoForm({
      providerId: provider.id,
      domain: provider.domain,
      metadataXml: provider.metadata_xml || '',
      enabled: provider.enabled ?? true,
    });
  }

  async function handleToggleProvider(provider: SsoProvider) {
    if (!canManage) return;
    const result = await saveSsoProvider({
      workspaceId: workspace.id,
      providerId: provider.id,
      domain: provider.domain,
      metadataXml: provider.metadata_xml,
      enabled: !(provider.enabled ?? true),
    });

    if (result.error) {
      setSsoError(result.error);
    } else {
      setSsoSuccess('Provider status updated.');
      router.refresh();
    }
  }

  async function handleCreateScimToken() {
    if (!canManage || !selectedProviderId) return;
    setScimCreating(true);
    setScimError(null);
    setNewScimToken(null);

    const result = await createScimToken({
      workspaceId: workspace.id,
      providerId: selectedProviderId,
    });

    if (result.error) {
      setScimError(result.error);
    } else if (result.token) {
      setNewScimToken(result.token);
      router.refresh();
    }

    setScimCreating(false);
  }

  async function handleRevokeScimToken(tokenId: string) {
    if (!canManage) return;
    setScimRevokingId(tokenId);
    setScimError(null);

    const result = await revokeScimToken({ workspaceId: workspace.id, tokenId });
    if (result.error) {
      setScimError(result.error);
    } else {
      router.refresh();
    }

    setScimRevokingId(null);
  }

  async function handleCreateAccessReview(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;

    setAccessCreating(true);
    setAccessError(null);
    setAccessSuccess(null);

    try {
      const res = await fetch('/api/access-review/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspace.id,
          period_start: accessPeriodStart || null,
          period_end: accessPeriodEnd || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create access review cycle.');
      }
      setAccessSuccess('Access review cycle created.');
      setAccessPeriodStart('');
      setAccessPeriodEnd('');
      router.refresh();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Failed to create access review cycle.');
    } finally {
      setAccessCreating(false);
    }
  }

  async function handleRefreshSla() {
    setSlaRefreshing(true);
    setSlaError(null);
    try {
      const params = new URLSearchParams({
        workspace_id: workspace.id,
        window_days: '30',
      });
      const res = await fetch(`/api/ops/sla?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load SLA summary.');
      }
      setSlaSummary({
        workspace_id: data.workspace_id,
        window_start: data.window_start,
        window_end: data.window_end,
        uptime_percent: data.uptime_percent,
        downtime_seconds: data.downtime_seconds,
        policies: data.policies || [],
      });
    } catch (error) {
      setSlaError(error instanceof Error ? error.message : 'Failed to load SLA summary.');
    } finally {
      setSlaRefreshing(false);
    }
  }

  const providerDomain = (providerId: string | null) =>
    initialSsoProviders.find((provider) => provider.id === providerId)?.domain || 'Unknown';

  const formatDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString() : '-';

  const shortId = (value: string | null | undefined) =>
    value ? `${value.slice(0, 8)}...` : '-';

  const statusBadge = (status: string | null | undefined) => {
    const normalized = (status || 'unknown').toLowerCase();
    if (normalized === 'healthy' || normalized === 'completed' || normalized === 'pass') {
      return 'bg-emerald-900/30 text-emerald-300';
    }
    if (normalized === 'lagging' || normalized === 'warning' || normalized === 'running') {
      return 'bg-amber-900/30 text-amber-300';
    }
    if (normalized === 'broken' || normalized === 'failed' || normalized === 'error') {
      return 'bg-red-900/30 text-red-300';
    }
    return 'bg-zinc-800 text-zinc-300';
  };

  const retentionScopes = Array.from(
    new Set([
      ...initialRetentionJobs.map((job) => job.scope),
      ...initialRetentionExecutions.map((execution) => execution.scope),
    ])
  );

  const latestRetentionJob = (scope: string) => {
    return initialRetentionJobs
      .filter((job) => job.scope === scope)
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0];
  };

  const latestRetentionExecution = (scope: string) => {
    return initialRetentionExecutions
      .filter((exec) => exec.scope === scope)
      .sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())[0];
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-bold mb-2">Workspace Admin</h1>
      <p className="text-sm text-zinc-400 mb-8">Operational controls for alerts, audit logs, identity, and compliance.</p>

      {/* Tab Navigation */}
      <div className="flex space-x-6 border-b border-zinc-800 mb-8">
        {canManage && (
          <button
            onClick={() => setActiveTab('alerts')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'alerts' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Smart Alerts
          </button>
        )}
        {canViewAudit && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Audit Logs
          </button>
        )}
        {canViewLegalHold && (
          <button
            onClick={() => setActiveTab('legal')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'legal'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Legal Hold
          </button>
        )}
        {canManage && (
          <button
            onClick={() => setActiveTab('members')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'members' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Team Members
          </button>
        )}
        {canViewSso && (
          <button
            onClick={() => setActiveTab('identity')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'identity'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            SSO & SCIM
          </button>
        )}
        {canViewAccessReviews && (
          <button
            onClick={() => setActiveTab('access')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'access'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Access Reviews
          </button>
        )}
        {canViewOps && (
          <button
            onClick={() => setActiveTab('ops')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'ops'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            SLA & Incidents
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'alerts' && canManage ? (
        <div className="relative">
          <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-6 ${!canUseAlerts && 'opacity-50 pointer-events-none blur-[1px]'}`}>
            <h2 className="text-xl font-semibold text-white mb-6">Smart Alerts</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Destination (Email)</label>
                <input 
                  type="email" 
                  value={settings.destination}
                  onChange={(e) => setSettings({...settings, destination: e.target.value})}
                  placeholder="alerts@company.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-4 py-2.5 text-zinc-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-medium text-zinc-400 mb-2">Threshold (Failures)</label>
                   <select 
                     value={settings.critical_fail_count}
                     onChange={(e) => setSettings({...settings, critical_fail_count: Number(e.target.value)})}
                     className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-4 py-2.5 text-zinc-200"
                   >
                     <option value="1">1 Failure</option>
                     <option value="3">3 Failures (Recommended)</option>
                     <option value="5">5 Failures</option>
                     <option value="10">10 Failures</option>
                   </select>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Time Window</label>
                    <select 
                     value={settings.window_minutes}
                     onChange={(e) => setSettings({...settings, window_minutes: Number(e.target.value)})}
                     className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-4 py-2.5 text-zinc-200"
                   >
                     <option value="5">5 Minutes</option>
                     <option value="10">10 Minutes</option>
                     <option value="30">30 Minutes</option>
                     <option value="60">1 Hour</option>
                   </select>
                 </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                 <div className="flex items-center gap-3">
                   <button 
                      onClick={() => setSettings({...settings, enabled: !settings.enabled})}
                      className={`w-11 h-6 rounded-full transition-colors relative ${settings.enabled ? 'bg-green-500' : 'bg-zinc-700'}`}
                   >
                      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                   </button>
                   <span className="text-zinc-400 text-sm">Alerts Enabled</span>
                 </div>
                 
                 <button 
                   onClick={handleSave}
                   disabled={saving}
                   className="bg-zinc-100 hover:bg-white text-zinc-900 px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
                 >
                   {saving ? 'Saving...' : 'Save Changes'}
                 </button>
              </div>
            </div>
          </div>
          
          {!canUseAlerts && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="bg-zinc-950/90 border border-zinc-800 p-8 rounded-xl text-center backdrop-blur-sm max-w-sm mx-4">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Smart Alerts are Locked</h3>
                <p className="text-zinc-400 mb-6 text-sm">Upgrade to the Team plan to enable real-time critical alerts via email.</p>
                <a href="/contact" className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-md transition-colors">
                  Contact Sales
                </a>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'audit' && canViewAudit ? (
        /* Audit Logs Tab */
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm relative">
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
             <div>
               <h2 className="text-xl font-semibold text-white mb-1">Audit Log</h2>
               <p className="text-zinc-400 text-sm">Track all critical actions in your workspace.</p>
             </div>
             {/* Simple export button placeholder */}
             <button className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-2" disabled={!isTeam}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
             </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/50 border-b border-zinc-800">
                <tr>
                   <th className="px-6 py-4 font-medium text-zinc-400">Action</th>
                   <th className="px-6 py-4 font-medium text-zinc-400">Actor</th>
                   <th className="px-6 py-4 font-medium text-zinc-400">Resource</th>
                   <th className="px-6 py-4 font-medium text-zinc-400">Details</th>
                   <th className="px-6 py-4 font-medium text-zinc-400 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {initialAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  initialAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-zinc-300">{log.action}</td>
                      <td className="px-6 py-4 text-zinc-300">
                         {/* We only have actor_id, ideally we'd join with users or show ID snippet */}
                         <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{log.actor_id ? log.actor_id.slice(0, 8) + '...' : 'System'}</span>
                      </td>
                      <td className="px-6 py-4 text-zinc-400">{log.target_resource || '-'}</td>
                      <td className="px-6 py-4 text-zinc-400 max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </td>
                      <td className="px-6 py-4 text-right text-zinc-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isTeam && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="bg-zinc-950/90 border border-zinc-800 p-8 rounded-xl text-center backdrop-blur-sm max-w-sm mx-4">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Audit Log is Locked</h3>
                <p className="text-zinc-400 mb-6 text-sm">Upgrade to the Team plan to access audit logs.</p>
                <a href="/contact" className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-md transition-colors">
                  Contact Sales
                </a>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'legal' && canViewLegalHold ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Legal Hold</h2>
              <p className="text-zinc-400 text-sm">Status of active legal holds for this workspace.</p>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-4 text-sm text-zinc-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200">Status</span>
              {initialLegalHold?.active ? (
                <span className="font-mono text-emerald-400">Active</span>
              ) : (
                <span className="font-mono text-zinc-400">Not active</span>
              )}
            </div>

            {initialLegalHold?.active && (
              <div className="mt-3 space-y-2 text-xs text-zinc-400">
                {initialLegalHold.created_at && (
                  <div>
                    <span className="font-semibold text-zinc-300">Active Since:</span>{' '}
                    <span className="font-mono">{new Date(initialLegalHold.created_at).toLocaleString()}</span>
                  </div>
                )}
                {initialLegalHold.reason && (
                  <div>
                    <span className="font-semibold text-zinc-300">Reason:</span>{' '}
                    <span className="font-mono">{initialLegalHold.reason}</span>
                  </div>
                )}
              </div>
            )}

            {!initialLegalHold?.active && (
              <p className="mt-3 text-xs text-zinc-500">No active legal hold.</p>
            )}
          </div>
        </div>
      ) : activeTab === 'members' && canManage ? (
        /* Team Members Tab */
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm relative">
           <h2 className="text-xl font-semibold text-white mb-6">Team Members</h2>
           
           {!isTeam && (
             <div className="absolute inset-0 flex items-center justify-center z-10 bg-zinc-950/90 rounded-xl backdrop-blur-sm">
                <div className="text-center p-8 border border-zinc-800 rounded-xl bg-zinc-950 max-w-sm">
                   <h3 className="text-xl font-bold text-white mb-2">Team Management Locked</h3>
                   <p className="text-zinc-400 mb-6 text-sm">Collaborate with your team by upgrading to the Team plan.</p>
                   <a href="/contact" className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-md transition-colors">
                      Contact Sales
                   </a>
                </div>
             </div>
           )}

           <div className={`${!isTeam && 'opacity-20 pointer-events-none'}`}>
             {/* Invite Form */}
             {canInvite && (
               <div className="mb-8 bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                 <h3 className="text-sm font-medium text-zinc-300 mb-4">Invite New Member</h3>
                 <form onSubmit={handleInvite} className="flex gap-3">
                   <input 
                     type="email" 
                     value={inviteEmail}
                     onChange={(e) => setInviteEmail(e.target.value)}
                     placeholder="colleague@example.com"
                     required
                     className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2 text-zinc-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                   />
                   <button 
                     type="submit" 
                     disabled={inviting}
                     className="bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
                   >
                     {inviting ? 'Adding...' : 'Add Member'}
                   </button>
                 </form>
                 {inviteError && <p className="text-red-400 text-sm mt-2">{inviteError}</p>}
                 {inviteSuccess && <p className="text-green-400 text-sm mt-2">{inviteSuccess}</p>}
                 <p className="text-xs text-zinc-500 mt-2">
                   Note: The user must already be signed up for LanceIQ.
                 </p>
               </div>
             )}

             {/* Member List */}
             <div className="overflow-hidden border border-zinc-800 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Joined</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {initialMembers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                          No other members found.
                        </td>
                      </tr>
                    ) : (
                      initialMembers.map((member) => (
                        <tr key={member.user_id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 text-zinc-200">{member.email}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              member.role === 'owner' ? 'bg-purple-900/30 text-purple-400' : 'bg-zinc-800 text-zinc-300'
                            }`}>
                              {member.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-500">{new Date(member.joined_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-right">
                            {canRemove && member.user_id !== currentUserId && (
                              <button 
                                onClick={() => handleRemove(member.user_id)}
                                className="text-red-400 hover:text-red-300 text-xs font-medium"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
             </div>
           </div>
        </div>
      ) : activeTab === 'identity' && canViewSso ? (
        <div className="space-y-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">SSO Setup</h2>
                <p className="text-zinc-400 text-sm">Configure SAML metadata and domain mapping for your IdP.</p>
              </div>
              <div className="text-xs text-zinc-500">SAML 2.0</div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Metadata URL</p>
                <p className="text-sm font-mono text-zinc-200">/api/sso/saml/metadata</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">ACS URL</p>
                <p className="text-sm font-mono text-zinc-200">/api/sso/saml/acs</p>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-200">Identity Providers</h3>
                <span className="text-xs text-zinc-500">{initialSsoProviders.length} configured</span>
              </div>
              {initialSsoProviders.length === 0 ? (
                <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-lg p-4">
                  No SSO providers configured yet.
                </div>
              ) : (
                <div className="overflow-hidden border border-zinc-800 rounded-lg">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-950 text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Domain</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Updated</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {initialSsoProviders.map((provider) => (
                        <tr key={provider.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 text-zinc-200">{provider.domain}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              provider.enabled ? 'bg-emerald-900/30 text-emerald-300' : 'bg-zinc-800 text-zinc-300'
                            }`}>
                              {provider.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-500">{formatDate(provider.updated_at)}</td>
                          <td className="px-4 py-3 text-right space-x-3">
                            {canManage && (
                              <>
                                <button
                                  onClick={() => startEditProvider(provider)}
                                  className="text-xs text-blue-400 hover:text-blue-300"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleToggleProvider(provider)}
                                  className="text-xs text-zinc-400 hover:text-zinc-200"
                                >
                                  {provider.enabled ? 'Disable' : 'Enable'}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canManage ? (
              <form onSubmit={handleSaveSsoProvider} className="mt-6 bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    {ssoForm.providerId ? 'Update Provider' : 'Add Provider'}
                  </h3>
                  {ssoForm.providerId && (
                    <button
                      type="button"
                      onClick={() => setSsoForm({ providerId: null, domain: '', metadataXml: '', enabled: true })}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Domain Mapping</label>
                  <input
                    value={ssoForm.domain}
                    onChange={(e) => setSsoForm({ ...ssoForm, domain: e.target.value })}
                    placeholder="acme.com"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2.5 text-zinc-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">IdP Metadata XML</label>
                  <textarea
                    value={ssoForm.metadataXml}
                    onChange={(e) => setSsoForm({ ...ssoForm, metadataXml: e.target.value })}
                    placeholder="Paste IdP metadata XML here"
                    rows={6}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2.5 text-zinc-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-xs"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-3 text-sm text-zinc-400">
                    <button
                      type="button"
                      onClick={() => setSsoForm({ ...ssoForm, enabled: !ssoForm.enabled })}
                      className={`w-11 h-6 rounded-full transition-colors relative ${ssoForm.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                    >
                      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${ssoForm.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    Provider Enabled
                  </label>
                  <button
                    type="submit"
                    disabled={ssoSaving}
                    className="bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
                  >
                    {ssoSaving ? 'Saving...' : 'Save Provider'}
                  </button>
                </div>
                {ssoError && <p className="text-red-400 text-sm">{ssoError}</p>}
                {ssoSuccess && <p className="text-green-400 text-sm">{ssoSuccess}</p>}
              </form>
            ) : (
              <div className="mt-6 text-sm text-zinc-500">
                You have read-only access to SSO configuration.
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">SCIM Tokens</h2>
                <p className="text-zinc-400 text-sm">Provision users and groups with SCIM.</p>
              </div>
              <div className="text-xs text-zinc-500">Base URL: /api/scim/v2</div>
            </div>

            {!canManage && (
              <div className="mt-4 text-sm text-zinc-500">
                Only owners and admins can create or revoke SCIM tokens.
              </div>
            )}

            {canManage && (
              <div className="mt-6 bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                {initialSsoProviders.length === 0 ? (
                  <p className="text-sm text-zinc-500">Add an SSO provider before creating SCIM tokens.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-zinc-400">Provider</label>
                      <select
                        value={selectedProviderId}
                        onChange={(e) => setSelectedProviderId(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-200"
                      >
                        {initialSsoProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>{provider.domain}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleCreateScimToken}
                        disabled={scimCreating || !selectedProviderId}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                      >
                        {scimCreating ? 'Creating...' : 'Create Token'}
                      </button>
                    </div>
                    {newScimToken && (
                      <div className="bg-zinc-900 border border-zinc-700 rounded-md p-4">
                        <p className="text-xs uppercase text-zinc-500 mb-2">New SCIM Token (shown once)</p>
                        <p className="text-sm font-mono text-zinc-200 break-all">{newScimToken}</p>
                      </div>
                    )}
                    {scimError && <p className="text-sm text-red-400">{scimError}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 overflow-hidden border border-zinc-800 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Token Hash</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Last Used</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {initialScimTokens.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                        No SCIM tokens created yet.
                      </td>
                    </tr>
                  ) : (
                    initialScimTokens.map((token) => (
                      <tr key={token.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-200 font-mono">
                          {token.token_hash.slice(0, 12)}...
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{providerDomain(token.provider_id)}</td>
                        <td className="px-4 py-3 text-zinc-500">{formatDate(token.created_at)}</td>
                        <td className="px-4 py-3 text-zinc-500">{formatDate(token.last_used_at)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            token.revoked_at ? 'bg-zinc-800 text-zinc-300' : 'bg-emerald-900/30 text-emerald-300'
                          }`}>
                            {token.revoked_at ? 'Revoked' : 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canManage && !token.revoked_at && (
                            <button
                              onClick={() => handleRevokeScimToken(token.id)}
                              disabled={scimRevokingId === token.id}
                              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              {scimRevokingId === token.id ? 'Revoking...' : 'Revoke'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'access' && canViewAccessReviews ? (
        <div className="space-y-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Access Review Cycles</h2>
                <p className="text-zinc-400 text-sm">Create review cycles and track attestations.</p>
              </div>
              {!canManage && (
                <span className="text-xs text-zinc-500">Read-only</span>
              )}
            </div>

            {canManage && (
              <form onSubmit={handleCreateAccessReview} className="mt-6 bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Period Start</label>
                    <input
                      type="date"
                      value={accessPeriodStart}
                      onChange={(e) => setAccessPeriodStart(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2 text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Period End</label>
                    <input
                      type="date"
                      value={accessPeriodEnd}
                      onChange={(e) => setAccessPeriodEnd(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2 text-zinc-200"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">Dates are optional. Leave blank for an open-ended cycle.</p>
                  <button
                    type="submit"
                    disabled={accessCreating}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {accessCreating ? 'Creating...' : 'Create Cycle'}
                  </button>
                </div>
                {accessError && <p className="text-sm text-red-400">{accessError}</p>}
                {accessSuccess && <p className="text-sm text-green-400">{accessSuccess}</p>}
              </form>
            )}

            <div className="mt-6 overflow-hidden border border-zinc-800 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cycle</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Reviewer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {initialAccessReviewCycles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                        No access review cycles yet.
                      </td>
                    </tr>
                  ) : (
                    initialAccessReviewCycles.map((cycle) => (
                      <tr key={cycle.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-200 font-mono">{shortId(cycle.id)}</td>
                        <td className="px-4 py-3 text-zinc-400">{cycle.status || 'pending'}</td>
                        <td className="px-4 py-3 text-zinc-500">
                          {cycle.period_start || cycle.period_end
                            ? `${cycle.period_start ? new Date(cycle.period_start).toLocaleDateString() : '-'} → ${cycle.period_end ? new Date(cycle.period_end).toLocaleDateString() : '-'}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{formatDate(cycle.created_at)}</td>
                        <td className="px-4 py-3 text-zinc-500">{shortId(cycle.reviewer_id)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Attestations</h3>
                <p className="text-zinc-400 text-sm">Read-only record of access review decisions.</p>
              </div>
            </div>
            <div className="overflow-hidden border border-zinc-800 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cycle</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Decision</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                    <th className="px-4 py-3 font-medium">Reviewed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {initialAccessReviewDecisions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                        No attestations recorded yet.
                      </td>
                    </tr>
                  ) : (
                    initialAccessReviewDecisions.map((decision) => (
                      <tr key={decision.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-200 font-mono">{shortId(decision.cycle_id)}</td>
                        <td className="px-4 py-3 text-zinc-500">{shortId(decision.target_user_id)}</td>
                        <td className="px-4 py-3 text-zinc-400">{decision.decision || '-'}</td>
                        <td className="px-4 py-3 text-zinc-500">{decision.notes || '-'}</td>
                        <td className="px-4 py-3 text-zinc-500">{formatDate(decision.reviewed_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'ops' && canViewOps ? (
        <div className="space-y-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">SLA Summary</h2>
                <p className="text-zinc-400 text-sm">Uptime calculated over the last 30 days.</p>
              </div>
              <button
                onClick={handleRefreshSla}
                disabled={slaRefreshing}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {slaRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {slaError && <p className="text-sm text-red-400 mt-4">{slaError}</p>}
            {slaSummary ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <p className="text-xs uppercase text-zinc-500 mb-2">Uptime</p>
                  <p className="text-2xl font-semibold text-white">{slaSummary.uptime_percent.toFixed(2)}%</p>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <p className="text-xs uppercase text-zinc-500 mb-2">Downtime</p>
                  <p className="text-2xl font-semibold text-white">{Math.round(slaSummary.downtime_seconds / 60)} min</p>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <p className="text-xs uppercase text-zinc-500 mb-2">Window</p>
                  <p className="text-sm text-zinc-200">{new Date(slaSummary.window_start).toLocaleDateString()} → {new Date(slaSummary.window_end).toLocaleDateString()}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 mt-4">SLA summary is not available yet.</p>
            )}

            {slaSummary?.policies?.length ? (
              <div className="mt-6 overflow-hidden border border-zinc-800 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Policy</th>
                      <th className="px-4 py-3 font-medium">Target</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {slaSummary.policies.map((policy) => (
                      <tr key={policy.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-200">{policy.name}</td>
                        <td className="px-4 py-3 text-zinc-400">{policy.target_availability ? `${policy.target_availability}%` : '-'}</td>
                        <td className="px-4 py-3 text-zinc-500">{formatDate(policy.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">DR Replication Status</h2>
                <p className="text-zinc-400 text-sm">Replication health by region.</p>
              </div>
              {canManage ? (
                <button
                  onClick={loadReplicationStatus}
                  disabled={replicationLoading}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  {replicationLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              ) : null}
            </div>

            {!canManage ? (
              <p className="text-sm text-zinc-500 mt-4">Replication status is available to owners and admins.</p>
            ) : replicationError ? (
              <p className="text-sm text-red-400 mt-4">{replicationError}</p>
            ) : replicationLoading && !replicationStatus ? (
              <p className="text-sm text-zinc-500 mt-4">Loading replication status...</p>
            ) : replicationStatus ? (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <p className="text-xs uppercase text-zinc-500 mb-2">Overall Status</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(replicationStatus.summary.overall_status)}`}>
                      {replicationStatus.summary.overall_status || 'unknown'}
                    </span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <p className="text-xs uppercase text-zinc-500 mb-2">Max Lag</p>
                    <p className="text-2xl font-semibold text-white">
                      {replicationStatus.summary.max_lag_seconds !== null
                        ? `${replicationStatus.summary.max_lag_seconds}s`
                        : 'n/a'}
                    </p>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <p className="text-xs uppercase text-zinc-500 mb-2">Last Update</p>
                    <p className="text-sm text-zinc-200">
                      {replicationStatus.summary.last_updated_at ? new Date(replicationStatus.summary.last_updated_at).toLocaleString() : 'n/a'}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden border border-zinc-800 rounded-lg">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-950 text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Region</th>
                        <th className="px-4 py-3 font-medium">Mode</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Lag</th>
                        <th className="px-4 py-3 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {replicationStatus.regions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                            No replication regions configured.
                          </td>
                        </tr>
                      ) : (
                        replicationStatus.regions.map((region) => (
                          <tr key={region.config_id} className="hover:bg-zinc-800/30">
                            <td className="px-4 py-3 text-zinc-200">{region.region}</td>
                            <td className="px-4 py-3 text-zinc-400">{region.mode}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(region.status)}`}>
                                {region.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-zinc-400">{region.lag_seconds !== null ? `${region.lag_seconds}s` : 'n/a'}</td>
                            <td className="px-4 py-3 text-zinc-500">{formatDate(region.updated_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 mt-4">No replication status available yet.</p>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Runbook Checks</h2>
                <p className="text-zinc-400 text-sm">Latest runbook checks for global and workspace scopes.</p>
              </div>
              <button
                onClick={loadRunbookChecks}
                disabled={runbookLoading}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {runbookLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {runbookError && <p className="text-sm text-red-400 mt-4">{runbookError}</p>}
            {runbookLoading && runbookChecks.length === 0 ? (
              <p className="text-sm text-zinc-500 mt-4">Loading runbook checks...</p>
            ) : (
              <div className="mt-6 overflow-hidden border border-zinc-800 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Check</th>
                      <th className="px-4 py-3 font-medium">Scope</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Last Result</th>
                      <th className="px-4 py-3 font-medium">Executed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {runbookChecks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                          No runbook checks available.
                        </td>
                      </tr>
                    ) : (
                      runbookChecks.map((check) => (
                        <tr key={check.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 text-zinc-200">{check.check_type}</td>
                          <td className="px-4 py-3 text-zinc-400">{check.workspace_id ? 'Workspace' : 'Global'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(check.status || check.latest_result?.status || 'unknown')}`}>
                              {check.latest_result?.status || check.status || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-400">{check.latest_result?.summary || '-'}</td>
                          <td className="px-4 py-3 text-zinc-500">{formatDate(check.latest_result?.executed_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Retention Automation</h2>
                <p className="text-zinc-400 text-sm">Last retention run status per scope.</p>
              </div>
            </div>

            {!canManage ? (
              <p className="text-sm text-zinc-500 mt-4">Retention automation status is available to owners and admins.</p>
            ) : (
              <div className="mt-6 overflow-hidden border border-zinc-800 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Scope</th>
                      <th className="px-4 py-3 font-medium">Last Run</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {retentionScopes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                          No retention jobs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      retentionScopes.map((scope) => {
                        const job = latestRetentionJob(scope);
                        const execution = latestRetentionExecution(scope);
                        const lastRun = execution?.executed_at || job?.completed_at || job?.started_at || job?.scheduled_at || null;
                        const status = job?.status || (execution ? 'completed' : 'unknown');
                        return (
                          <tr key={scope} className="hover:bg-zinc-800/30">
                            <td className="px-4 py-3 text-zinc-200">{scope}</td>
                            <td className="px-4 py-3 text-zinc-500">{formatDate(lastRun)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(status)}`}>
                                {status || 'unknown'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-zinc-500">{job?.error_summary || '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Incidents</h2>
                <p className="text-zinc-400 text-sm">View workspace and global incident reports.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIncludeGlobal(true)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    includeGlobal ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Workspace + Global
                </button>
                <button
                  onClick={() => setIncludeGlobal(false)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    !includeGlobal ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Workspace Only
                </button>
              </div>
            </div>

            {incidentsError && <p className="text-sm text-red-400 mt-4">{incidentsError}</p>}
            {incidentsLoading ? (
              <p className="text-sm text-zinc-500 mt-4">Loading incidents...</p>
            ) : (
              <div className="mt-6 overflow-hidden border border-zinc-800 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Title</th>
                      <th className="px-4 py-3 font-medium">Scope</th>
                      <th className="px-4 py-3 font-medium">Severity</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Started</th>
                      <th className="px-4 py-3 font-medium">Resolved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {incidents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                          No incidents reported.
                        </td>
                      </tr>
                    ) : (
                      incidents.map((incident) => (
                        <tr key={incident.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 text-zinc-200">{incident.title}</td>
                          <td className="px-4 py-3 text-zinc-400">{incident.workspace_id ? 'Workspace' : 'Global'}</td>
                          <td className="px-4 py-3 text-zinc-400">{incident.severity || '-'}</td>
                          <td className="px-4 py-3 text-zinc-400">{incident.status || '-'}</td>
                          <td className="px-4 py-3 text-zinc-500">{formatDate(incident.started_at)}</td>
                          <td className="px-4 py-3 text-zinc-500">{formatDate(incident.resolved_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-zinc-400">
          Your role does not grant access to workspace settings.
        </div>
      )}
    </div>
  );
}
