import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const HOLD_ID = '22222222-2222-2222-2222-222222222222';
const CYCLE_ID = '33333333-3333-3333-3333-333333333333';
const INCIDENT_ID = '44444444-4444-4444-4444-444444444444';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createSupabaseClient: vi.fn(),
  hasWorkspaceEntitlement: vi.fn(),
  teamPlanForbiddenBody: vi.fn(() => ({ error: 'Team plan required for this endpoint.' })),
  logAuditAction: vi.fn().mockResolvedValue(undefined),
  generateApiKey: vi.fn(() => ({
    key: 'lk_test_123',
    hash: 'hash_123',
    last4: '0123',
  })),
  computeUptime: vi.fn(() => ({
    uptimePercent: 99.95,
    downtimeSeconds: 120,
  })),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createSupabaseClient,
}));

vi.mock('@/lib/team-plan-gate', () => ({
  hasWorkspaceEntitlement: mocks.hasWorkspaceEntitlement,
  teamPlanForbiddenBody: mocks.teamPlanForbiddenBody,
}));

vi.mock('@/utils/audit', () => ({
  AUDIT_ACTIONS: {
    LEGAL_HOLD_CREATED: 'legal_hold.created',
    LEGAL_HOLD_DEACTIVATED: 'legal_hold.deactivated',
    ACCESS_REVIEW_CREATED: 'access_review.created',
    ACCESS_REVIEW_DECISION: 'access_review.decision',
    KEY_ROTATED: 'key.rotated',
  },
  logAuditAction: mocks.logAuditAction,
}));

vi.mock('@/lib/api-key', () => ({
  generateApiKey: mocks.generateApiKey,
}));

vi.mock('@/lib/sla/compute', () => ({
  computeUptime: mocks.computeUptime,
}));

import { POST as legalHoldsPost, PATCH as legalHoldsPatch } from '@/app/api/ingest/legal-holds/route';
import { GET as accessReviewCyclesGet, POST as accessReviewCyclesPost } from '@/app/api/access-review/cycles/route';
import { POST as accessReviewDecisionsPost } from '@/app/api/access-review/decisions/route';
import { GET as accessReviewSchedulesGet, POST as accessReviewSchedulesPost } from '@/app/api/access-review/schedules/route';
import { GET as opsIncidentsGet, POST as opsIncidentsPost, PATCH as opsIncidentsPatch } from '@/app/api/ops/incidents/route';
import { GET as opsSlaGet } from '@/app/api/ops/sla/route';
import { GET as replicationStatusGet } from '@/app/api/ops/replication/status/route';
import { GET as runbookChecksGet } from '@/app/api/ops/runbooks/checks/route';
import { POST as keyRotatePost } from '@/app/api/workspaces/keys/rotate/route';
import { GET as keyRotationsGet } from '@/app/api/workspaces/keys/rotations/route';

type Scenario = {
  userId: string | null;
  membership: boolean;
  role: string;
};

function makeRequest(url: string) {
  return { nextUrl: new URL(url), headers: { get: () => null } } as any;
}

function makeJsonRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: () => null },
  } as any;
}

function makeSupabaseClient(scenario?: Partial<Scenario>, type: 'server' | 'admin' = 'server') {
  const resolved: Scenario = {
    userId: 'user_1',
    membership: true,
    role: 'owner',
    ...scenario,
  };

  function buildResult(table: string, action: string, mode: 'single' | 'maybeSingle' | 'many', state: any) {
    if (table === 'workspace_members') {
      return resolved.membership ? { workspace_id: WORKSPACE_ID, role: resolved.role } : null;
    }
    if (table === 'workspace_legal_holds') {
      if (action === 'insert') {
        return { id: HOLD_ID, active: true, created_at: '2026-02-12T00:00:00.000Z' };
      }
      if (action === 'update') {
        return { id: HOLD_ID, active: false };
      }
    }
    if (table === 'access_review_cycles') {
      if (action === 'insert') {
        return { id: CYCLE_ID, workspace_id: WORKSPACE_ID, period_start: null, period_end: null };
      }
      if (mode === 'single') {
        return { id: state.eq.id || CYCLE_ID, workspace_id: WORKSPACE_ID };
      }
      return [{ id: CYCLE_ID, workspace_id: WORKSPACE_ID }];
    }
    if (table === 'access_review_decisions') {
      return { id: 'dec_1', cycle_id: CYCLE_ID, decision: 'approve' };
    }
    if (table === 'access_review_schedules') {
      if (action === 'upsert') {
        return { id: 'sched_1', workspace_id: WORKSPACE_ID, active: true };
      }
      return { id: 'sched_1', workspace_id: WORKSPACE_ID, active: true };
    }
    if (table === 'incident_reports') {
      if (action === 'insert' || action === 'update') {
        return { id: INCIDENT_ID, workspace_id: WORKSPACE_ID, status: 'investigating' };
      }
      if (mode === 'single') {
        return { id: state.eq.id || INCIDENT_ID, workspace_id: WORKSPACE_ID };
      }
      return [{ id: INCIDENT_ID, workspace_id: WORKSPACE_ID, started_at: '2026-02-12T00:00:00.000Z', resolved_at: null }];
    }
    if (table === 'sla_policies') {
      return [{ id: 'sla_1', workspace_id: WORKSPACE_ID }];
    }
    if (table === 'replication_configs') {
      return [
        {
          id: 'cfg_1',
          region: 'us-east-1',
          mode: 'sync',
          enabled: true,
          created_at: '2026-02-12T00:00:00.000Z',
        },
      ];
    }
    if (table === 'replication_status') {
      return [
        {
          replication_config_id: 'cfg_1',
          status: 'healthy',
          lag_seconds: 1,
          updated_at: '2026-02-12T00:00:00.000Z',
          details: null,
        },
      ];
    }
    if (table === 'runbook_checks') {
      return [
        {
          id: 'chk_1',
          workspace_id: WORKSPACE_ID,
          check_type: 'failover',
          status: 'active',
          details: null,
          created_at: '2026-02-12T00:00:00.000Z',
        },
      ];
    }
    if (table === 'runbook_check_results') {
      return [{ check_id: 'chk_1', status: 'pass', summary: 'ok', executed_at: '2026-02-12T00:00:00.000Z' }];
    }
    if (table === 'workspaces') {
      if (action === 'select') {
        return { api_key_hash: 'old_hash', api_key_last4: '1234' };
      }
      return null;
    }
    if (table === 'api_key_rotations') {
      if (action === 'select') {
        return [{ id: 'rot_1', workspace_id: WORKSPACE_ID, rotated_at: '2026-02-12T00:00:00.000Z' }];
      }
      return { id: 'rot_1' };
    }
    if (table === 'sso_providers') {
      return { id: 'sso_1' };
    }
    if (table === 'scim_tokens') {
      return { id: 'token_1' };
    }
    return mode === 'many' ? [] : null;
  }

  function makeBuilder(table: string) {
    const state: any = {
      action: 'select',
      eq: {},
    };

    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        state.eq[column] = value;
        return builder;
      }),
      or: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: buildResult(table, state.action, 'maybeSingle', state), error: null })),
      single: vi.fn(async () => ({ data: buildResult(table, state.action, 'single', state), error: null })),
      insert: vi.fn(() => {
        state.action = 'insert';
        return builder;
      }),
      update: vi.fn(() => {
        state.action = 'update';
        return builder;
      }),
      upsert: vi.fn(() => {
        state.action = 'upsert';
        return builder;
      }),
      then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) => {
        const result = { data: buildResult(table, state.action, 'many', state), error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    return builder;
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: resolved.userId ? { id: resolved.userId } : null } })),
    },
    from: vi.fn((table: string) => makeBuilder(table)),
    _type: type,
  };
}

describe('Team-plan gating for backend admin/compliance APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    mocks.createServerClient.mockResolvedValue(makeSupabaseClient());
    mocks.createSupabaseClient.mockReturnValue(makeSupabaseClient({}, 'admin'));
    mocks.hasWorkspaceEntitlement.mockResolvedValue(true);
  });

  it('blocks legal-hold create when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await legalHoldsPost(makeJsonRequest({ workspace_id: WORKSPACE_ID, reason: 'hold' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows legal-hold create when Team entitlement is present', async () => {
    const response = await legalHoldsPost(makeJsonRequest({ workspace_id: WORKSPACE_ID, reason: 'hold' }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.id).toBe(HOLD_ID);
  });

  it('blocks legal-hold deactivate when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await legalHoldsPatch(makeJsonRequest({ workspace_id: WORKSPACE_ID, hold_id: HOLD_ID }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows legal-hold deactivate when Team entitlement is present', async () => {
    const response = await legalHoldsPatch(makeJsonRequest({ workspace_id: WORKSPACE_ID, hold_id: HOLD_ID }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.id).toBe(HOLD_ID);
  });

  it('blocks access-review cycles list when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await accessReviewCyclesGet(makeRequest(`https://example.com/api/access-review/cycles?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows access-review cycles list when Team entitlement is present', async () => {
    const response = await accessReviewCyclesGet(makeRequest(`https://example.com/api/access-review/cycles?workspace_id=${WORKSPACE_ID}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(payload.cycles)).toBe(true);
  });

  it('blocks access-review cycles create when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await accessReviewCyclesPost(makeJsonRequest({ workspace_id: WORKSPACE_ID }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows access-review cycles create when Team entitlement is present', async () => {
    const response = await accessReviewCyclesPost(makeJsonRequest({ workspace_id: WORKSPACE_ID }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.cycle.id).toBe(CYCLE_ID);
  });

  it('blocks access-review decisions create when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await accessReviewDecisionsPost(
      makeJsonRequest({ cycle_id: CYCLE_ID, target_user_id: 'user_2', decision: 'approve' })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows access-review decisions create when Team entitlement is present', async () => {
    const response = await accessReviewDecisionsPost(
      makeJsonRequest({ cycle_id: CYCLE_ID, target_user_id: 'user_2', decision: 'approve' })
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.decision.id).toBe('dec_1');
  });

  it('blocks access-review schedules list when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await accessReviewSchedulesGet(makeRequest(`https://example.com/api/access-review/schedules?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('requires workspace membership before returning access-review schedules', async () => {
    mocks.createServerClient.mockResolvedValue(makeSupabaseClient({ membership: false }));
    const response = await accessReviewSchedulesGet(makeRequest(`https://example.com/api/access-review/schedules?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(mocks.hasWorkspaceEntitlement).not.toHaveBeenCalled();
  });

  it('allows access-review schedules list when Team entitlement is present', async () => {
    const response = await accessReviewSchedulesGet(makeRequest(`https://example.com/api/access-review/schedules?workspace_id=${WORKSPACE_ID}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.schedule.id).toBe('sched_1');
  });

  it('blocks access-review schedules save when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await accessReviewSchedulesPost(makeJsonRequest({ workspace_id: WORKSPACE_ID, rrule: 'FREQ=DAILY' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows access-review schedules save when Team entitlement is present', async () => {
    const response = await accessReviewSchedulesPost(makeJsonRequest({ workspace_id: WORKSPACE_ID, rrule: 'FREQ=DAILY' }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.schedule.id).toBe('sched_1');
  });

  it('blocks incidents list when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await opsIncidentsGet(makeRequest(`https://example.com/api/ops/incidents?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows incidents list when Team entitlement is present', async () => {
    const response = await opsIncidentsGet(makeRequest(`https://example.com/api/ops/incidents?workspace_id=${WORKSPACE_ID}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(payload.incidents)).toBe(true);
  });

  it('blocks incidents create when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await opsIncidentsPost(makeJsonRequest({ workspace_id: WORKSPACE_ID, title: 'Incident', severity: 'sev1' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows incidents create when Team entitlement is present', async () => {
    const response = await opsIncidentsPost(makeJsonRequest({ workspace_id: WORKSPACE_ID, title: 'Incident', severity: 'sev1' }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.incident.id).toBe(INCIDENT_ID);
  });

  it('blocks incidents update when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await opsIncidentsPatch(makeJsonRequest({ incident_id: INCIDENT_ID, status: 'resolved' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows incidents update when Team entitlement is present', async () => {
    const response = await opsIncidentsPatch(makeJsonRequest({ incident_id: INCIDENT_ID, status: 'resolved' }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.incident.id).toBe(INCIDENT_ID);
  });

  it('blocks SLA summary when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await opsSlaGet(makeRequest(`https://example.com/api/ops/sla?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows SLA summary when Team entitlement is present', async () => {
    const response = await opsSlaGet(makeRequest(`https://example.com/api/ops/sla?workspace_id=${WORKSPACE_ID}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.workspace_id).toBe(WORKSPACE_ID);
  });

  it('blocks replication status when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await replicationStatusGet(makeRequest(`https://example.com/api/ops/replication/status?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows replication status when Team entitlement is present', async () => {
    const response = await replicationStatusGet(makeRequest(`https://example.com/api/ops/replication/status?workspace_id=${WORKSPACE_ID}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.summary.overall_status).toBe('healthy');
  });

  it('blocks runbook checks when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await runbookChecksGet(makeRequest(`https://example.com/api/ops/runbooks/checks?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows runbook checks when Team entitlement is present', async () => {
    const response = await runbookChecksGet(makeRequest(`https://example.com/api/ops/runbooks/checks?workspace_id=${WORKSPACE_ID}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(payload.checks)).toBe(true);
  });

  it('blocks key rotation when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await keyRotatePost(makeJsonRequest({ workspace_id: WORKSPACE_ID, reason: 'routine' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows key rotation when Team entitlement is present', async () => {
    const response = await keyRotatePost(makeJsonRequest({ workspace_id: WORKSPACE_ID, reason: 'routine' }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.api_key).toBe('lk_test_123');
  });

  it('blocks key-rotation log reads when plan is not entitled', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const response = await keyRotationsGet(makeRequest(`https://example.com/api/workspaces/keys/rotations?workspace_id=${WORKSPACE_ID}`));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows key-rotation log reads when Team entitlement is present', async () => {
    const response = await keyRotationsGet(makeRequest(`https://example.com/api/workspaces/keys/rotations?workspace_id=${WORKSPACE_ID}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(payload.rotations)).toBe(true);
  });
});
