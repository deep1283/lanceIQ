import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import SettingsClient from './client';
import { checkPlanEntitlements } from '@/app/actions/subscription';
import { resolveWorkspaceContext } from '@/lib/workspace-context';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
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
    store_raw_body: context.workspace.store_raw_body ?? false,
  };
  const entitlements = await checkPlanEntitlements(workspace.id);

  let teamAdminEmails: string[] = [];
  const canViewTeamEmails =
    entitlements.canUseSso && (context.role === 'owner' || context.role === 'admin');

  if (canViewTeamEmails) {
    try {
      const adminClient = createAdminClient();
      const { data: adminMembers } = await adminClient
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspace.id)
        .in('role', ['owner', 'admin']);

      const uniqueUserIds = Array.from(new Set((adminMembers || []).map((m) => m.user_id).filter(Boolean)));

      const users = await Promise.all(
        uniqueUserIds.map(async (userId) => {
          const { data } = await adminClient.auth.admin.getUserById(userId);
          return data?.user?.email?.trim().toLowerCase() || null;
        })
      );

      teamAdminEmails = Array.from(new Set(users.filter((email): email is string => Boolean(email))));
    } catch {
      teamAdminEmails = [];
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm dashboard-text-muted hover:text-[var(--dash-text)] transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>
      <SettingsClient
        workspace={workspace}
        userEmail={user.email ?? null}
        workspaceRole={context.role ?? 'member'}
        effectiveEntitlements={entitlements}
        teamAdminEmails={teamAdminEmails}
      />
    </div>
  );
}
