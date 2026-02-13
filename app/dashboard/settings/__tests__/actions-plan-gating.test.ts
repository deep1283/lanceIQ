import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
  hasWorkspaceEntitlement: vi.fn(),
  revalidatePath: vi.fn(),
  hashScimToken: vi.fn(() => 'hashed_token'),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: mocks.createServerClient,
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/team-plan-gate', async () => {
  const actual = await vi.importActual<typeof import('@/lib/team-plan-gate')>('@/lib/team-plan-gate');
  return {
    ...actual,
    hasWorkspaceEntitlement: mocks.hasWorkspaceEntitlement,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/scim/utils', () => ({
  hashScimToken: mocks.hashScimToken,
}));

import { createScimToken, revokeScimToken, saveSsoProvider } from '@/app/dashboard/settings/actions';

function makeMembershipBuilder(role = 'owner') {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: { role }, error: null })),
  };
  return builder;
}

function makeSsoProvidersBuilder() {
  const state: any = { action: 'insert' };
  const builder: any = {
    insert: vi.fn(() => {
      state.action = 'insert';
      return builder;
    }),
    update: vi.fn(() => {
      state.action = 'update';
      return builder;
    }),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => ({
      data: { id: 'sso_1', workspace_id: WORKSPACE_ID, enabled: true, domain: 'example.com' },
      error: null,
    })),
  };
  return builder;
}

function makeServerClient(role = 'owner') {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user_1' } } })),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') return makeMembershipBuilder(role);
      if (table === 'sso_providers') return makeSsoProvidersBuilder();
      return makeMembershipBuilder(role);
    }),
  };
}

function makeAdminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'scim_tokens') {
        return {
          insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
          update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
        };
      }
      const state: any = { action: 'insert' };
      const builder: any = {
        insert: vi.fn(() => {
          state.action = 'insert';
          return builder;
        }),
        update: vi.fn(() => {
          state.action = 'update';
          return builder;
        }),
        eq: vi.fn(() => builder),
        select: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: { id: 'token_1' }, error: null })),
        then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject),
      };
      return builder;
    }),
  };
}

describe('Settings actions Team-plan gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    mocks.createServerClient.mockResolvedValue(makeServerClient());
    mocks.createAdminClient.mockReturnValue(makeAdminClient());
    mocks.hasWorkspaceEntitlement.mockResolvedValue(true);
  });

  it('blocks SSO provider save for non-Team plans', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const result = await saveSsoProvider({
      workspaceId: WORKSPACE_ID,
      domain: 'example.com',
      enabled: true,
    });
    expect(result).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows SSO provider save for Team plans', async () => {
    const result = await saveSsoProvider({
      workspaceId: WORKSPACE_ID,
      domain: 'example.com',
      enabled: true,
    });
    expect((result as any).provider.id).toBe('sso_1');
  });

  it('blocks SCIM token create for non-Team plans', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const result = await createScimToken({ workspaceId: WORKSPACE_ID, providerId: 'provider_1' });
    expect(result).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows SCIM token create for Team plans', async () => {
    const result = await createScimToken({ workspaceId: WORKSPACE_ID, providerId: 'provider_1' });
    expect((result as any).tokenRecord.id).toBe('token_1');
  });

  it('blocks SCIM token revoke for non-Team plans', async () => {
    mocks.hasWorkspaceEntitlement.mockResolvedValue(false);
    const result = await revokeScimToken({ workspaceId: WORKSPACE_ID, tokenId: 'token_1' });
    expect(result).toEqual({ error: 'Team plan required for this endpoint.' });
  });

  it('allows SCIM token revoke for Team plans', async () => {
    const result = await revokeScimToken({ workspaceId: WORKSPACE_ID, tokenId: 'token_1' });
    expect(result).toEqual({ success: true });
  });
});
