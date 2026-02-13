import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  checkPlanEntitlements: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  adminClient: vi.fn(() => null),
  redirect: vi.fn(),
  computeUptime: vi.fn(() => ({ uptimePercent: 99.9, downtimeSeconds: 60 })),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@/app/actions/subscription', () => ({
  checkPlanEntitlements: mocks.checkPlanEntitlements,
}));

vi.mock('@/lib/workspace-context', () => ({
  resolveWorkspaceContext: mocks.resolveWorkspaceContext,
}));

vi.mock('@/app/dashboard/admin/client', () => ({
  default: mocks.adminClient,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => null) })),
}));

vi.mock('@/lib/sla/compute', () => ({
  computeUptime: mocks.computeUptime,
}));

import AdminPage from '@/app/dashboard/admin/page';

function makeEntitlements(kind: 'free' | 'team') {
  if (kind === 'free') {
    return {
      plan: 'free',
      isPaid: false,
      isTeam: false,
      canExportPdf: true,
      canExportCsv: false,
      canVerify: false,
      canRemoveWatermark: false,
      canUseAlerts: false,
      canUseSso: false,
      canUseScim: false,
      canUseAccessReviews: false,
      canUseSlaIncidents: false,
      canUseLegalHold: false,
      canRotateKeys: false,
      canViewAuditLogs: false,
    };
  }

  return {
    plan: 'team',
    isPaid: true,
    isTeam: true,
    canExportPdf: true,
    canExportCsv: true,
    canVerify: true,
    canRemoveWatermark: true,
    canUseAlerts: true,
    canUseSso: true,
    canUseScim: true,
    canUseAccessReviews: true,
    canUseSlaIncidents: true,
    canUseLegalHold: true,
    canRotateKeys: true,
    canViewAuditLogs: true,
  };
}

function makeSupabaseClient() {
  const queriedTables: string[] = [];

  function buildResult(table: string, mode: 'single' | 'maybeSingle' | 'many', state: any) {
    if (table === 'workspace_alert_settings') {
      return { id: 'alert_1', channel: 'email', destination: 'ops@example.com', enabled: true, window_minutes: 10, critical_fail_count: 3 };
    }
    if (table === 'audit_logs') {
      return [{ id: 'log_1', action: 'workspace.updated', actor_id: 'user_1', target_resource: 'workspaces', details: {}, created_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'sso_providers') {
      return [{ id: 'sso_1', domain: 'example.com', metadata_xml: null, enabled: true, created_at: '2026-02-12T00:00:00.000Z', updated_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'scim_tokens') {
      return [{ id: 'scim_1', provider_id: 'sso_1', token_hash: 'hash', created_at: '2026-02-12T00:00:00.000Z', last_used_at: null, revoked_at: null, created_by: 'user_1' }];
    }
    if (table === 'access_review_cycles') {
      return [{ id: 'cycle_1', reviewer_id: 'user_1', status: 'pending', period_start: null, period_end: null, created_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'access_review_decisions') {
      return [{ id: 'dec_1', cycle_id: 'cycle_1', target_user_id: 'user_2', decision: 'approve', notes: null, reviewed_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'workspace_legal_holds') {
      return [{ id: 'hold_1', active: true, reason: 'regulatory', created_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'incident_reports') {
      if (typeof state.select === 'string' && state.select.includes('started_at, resolved_at')) {
        return [{ started_at: '2026-02-12T00:00:00.000Z', resolved_at: null }];
      }
      return [{ id: 'inc_1', workspace_id: WORKSPACE_ID, title: 'Incident', severity: 'sev2', status: 'investigating', started_at: '2026-02-12T00:00:00.000Z', resolved_at: null, affected_components: [], public_note: null, created_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'sla_policies') {
      return [{ id: 'sla_1', name: 'Default', target_availability: 99.9, violation_penalty_rate: null, created_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'retention_jobs') {
      return [{ id: 'job_1', workspace_id: WORKSPACE_ID, scope: 'raw_body', scheduled_at: '2026-02-12T00:00:00.000Z', started_at: null, completed_at: null, status: 'scheduled', error_summary: null, created_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'retention_executions') {
      return [{ id: 'exec_1', job_id: 'job_1', workspace_id: WORKSPACE_ID, scope: 'raw_body', rows_pruned: 10, rows_blocked_by_hold: 0, proof_hash: 'proof', executed_at: '2026-02-12T00:00:00.000Z' }];
    }
    return mode === 'many' ? [] : null;
  }

  function makeBuilder(table: string) {
    const state: any = { select: '*' };
    const builder: any = {
      select: vi.fn((value: string) => {
        state.select = value;
        return builder;
      }),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      or: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => ({ data: buildResult(table, 'single', state), error: null })),
      maybeSingle: vi.fn(async () => ({ data: buildResult(table, 'maybeSingle', state), error: null })),
      then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) =>
        Promise.resolve({ data: buildResult(table, 'many', state), error: null }).then(resolve, reject),
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user_1' } } })),
    },
    from: vi.fn((table: string) => {
      queriedTables.push(table);
      return makeBuilder(table);
    }),
    rpc: vi.fn(async (fn: string) => {
      queriedTables.push(`rpc:${fn}`);
      if (fn === 'get_workspace_members') {
        return { data: [{ user_id: 'user_1', email: 'owner@example.com', role: 'owner', joined_at: '2026-02-12T00:00:00.000Z' }], error: null };
      }
      return { data: [], error: null };
    }),
  };

  return { client, queriedTables };
}

describe('Admin page server-render Team gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error('redirect called');
    });
    mocks.resolveWorkspaceContext.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      role: 'owner',
      source: 'primary',
      workspace: {
        id: WORKSPACE_ID,
        name: 'Workspace',
        plan: 'team',
        subscription_status: 'active',
        raw_body_retention_days: 30,
        store_raw_body: true,
        created_at: '2026-02-12T00:00:00.000Z',
      },
    });
  });

  it('does not fetch Team-only datasets for Free/Pro entitlements', async () => {
    const { client, queriedTables } = makeSupabaseClient();
    mocks.createServerClient.mockResolvedValue(client);
    const effectiveEntitlements = makeEntitlements('free');
    mocks.checkPlanEntitlements.mockResolvedValue(effectiveEntitlements);

    const result = await AdminPage();
    const props = (result as any).props;
    expect(props.workspace.plan).toBe('team');
    expect(props.initialEntitlements).toEqual(effectiveEntitlements);
    expect(props.initialEntitlements.plan).toBe('free');
    expect(props.initialEntitlements.isTeam).toBe(false);
    expect(props.initialSettings).toBeNull();
    expect(props.initialAuditLogs).toEqual([]);
    expect(props.initialMembers).toEqual([]);
    expect(props.initialSsoProviders).toEqual([]);
    expect(props.initialScimTokens).toEqual([]);
    expect(props.initialAccessReviewCycles).toEqual([]);
    expect(props.initialAccessReviewDecisions).toEqual([]);
    expect(props.initialLegalHold).toBeNull();
    expect(props.initialIncidents).toEqual([]);
    expect(props.initialSlaSummary).toBeNull();
    expect(props.initialRetentionJobs).toEqual([]);
    expect(props.initialRetentionExecutions).toEqual([]);

    expect(queriedTables).not.toContain('workspace_alert_settings');
    expect(queriedTables).not.toContain('audit_logs');
    expect(queriedTables).not.toContain('sso_providers');
    expect(queriedTables).not.toContain('scim_tokens');
    expect(queriedTables).not.toContain('access_review_cycles');
    expect(queriedTables).not.toContain('workspace_legal_holds');
    expect(queriedTables).not.toContain('incident_reports');
    expect(queriedTables).not.toContain('sla_policies');
    expect(queriedTables).not.toContain('retention_jobs');
    expect(queriedTables).not.toContain('retention_executions');
    expect(queriedTables).not.toContain('rpc:get_workspace_members');
  });

  it('fetches Team-only datasets when Team entitlement and role allow it', async () => {
    const { client, queriedTables } = makeSupabaseClient();
    mocks.createServerClient.mockResolvedValue(client);
    const effectiveEntitlements = makeEntitlements('team');
    mocks.checkPlanEntitlements.mockResolvedValue(effectiveEntitlements);

    const result = await AdminPage();
    const props = (result as any).props;
    expect(props.initialEntitlements).toEqual(effectiveEntitlements);
    expect(props.initialSettings?.id).toBe('alert_1');
    expect(props.initialAuditLogs.length).toBe(1);
    expect(props.initialMembers.length).toBe(1);
    expect(props.initialSsoProviders.length).toBe(1);
    expect(props.initialScimTokens.length).toBe(1);
    expect(props.initialAccessReviewCycles.length).toBe(1);
    expect(props.initialAccessReviewDecisions.length).toBe(1);
    expect(props.initialLegalHold?.id).toBe('hold_1');
    expect(props.initialIncidents.length).toBe(1);
    expect(props.initialSlaSummary.workspace_id).toBe(WORKSPACE_ID);
    expect(props.initialRetentionJobs.length).toBe(1);
    expect(props.initialRetentionExecutions.length).toBe(1);

    expect(queriedTables).toContain('workspace_alert_settings');
    expect(queriedTables).toContain('audit_logs');
    expect(queriedTables).toContain('sso_providers');
    expect(queriedTables).toContain('scim_tokens');
    expect(queriedTables).toContain('access_review_cycles');
    expect(queriedTables).toContain('workspace_legal_holds');
    expect(queriedTables).toContain('incident_reports');
    expect(queriedTables).toContain('sla_policies');
    expect(queriedTables).toContain('retention_jobs');
    expect(queriedTables).toContain('retention_executions');
    expect(queriedTables).toContain('rpc:get_workspace_members');
  });

  it('requires role in addition to Team plan for privileged datasets', async () => {
    const { client, queriedTables } = makeSupabaseClient();
    mocks.createServerClient.mockResolvedValue(client);
    mocks.checkPlanEntitlements.mockResolvedValue(makeEntitlements('team'));
    mocks.resolveWorkspaceContext.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      role: 'member',
      source: 'primary',
      workspace: {
        id: WORKSPACE_ID,
        name: 'Workspace',
        plan: 'team',
        subscription_status: 'active',
        raw_body_retention_days: 30,
        store_raw_body: true,
        created_at: '2026-02-12T00:00:00.000Z',
      },
    });

    const result = await AdminPage();
    const props = (result as any).props;
    expect(props.initialSettings).toBeNull();
    expect(props.initialAuditLogs).toEqual([]);
    expect(props.initialMembers).toEqual([]);
    expect(props.initialSsoProviders).toEqual([]);
    expect(props.initialScimTokens).toEqual([]);
    expect(props.initialAccessReviewCycles).toEqual([]);
    expect(props.initialAccessReviewDecisions).toEqual([]);
    expect(props.initialLegalHold).toBeNull();
    expect(props.initialIncidents.length).toBe(1);
    expect(props.initialSlaSummary.workspace_id).toBe(WORKSPACE_ID);
    expect(props.initialRetentionJobs).toEqual([]);
    expect(props.initialRetentionExecutions).toEqual([]);

    expect(queriedTables).not.toContain('workspace_alert_settings');
    expect(queriedTables).not.toContain('audit_logs');
    expect(queriedTables).not.toContain('scim_tokens');
    expect(queriedTables).not.toContain('access_review_cycles');
    expect(queriedTables).not.toContain('workspace_legal_holds');
    expect(queriedTables).toContain('incident_reports');
    expect(queriedTables).toContain('sla_policies');
    expect(queriedTables).not.toContain('retention_jobs');
  });
});
