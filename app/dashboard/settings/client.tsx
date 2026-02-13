'use client';


import { useDashboardTheme } from '@/components/DashboardThemeProvider';
import type { PlanEntitlements } from '@/lib/plan';

interface Workspace {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'team';
  subscription_status: string;
  raw_body_retention_days: number;
  store_raw_body: boolean | null;
}

export default function SettingsClient({
  workspace,
  userEmail,
  workspaceRole,
  effectiveEntitlements,
  teamAdminEmails,
}: {
  workspace: Workspace;
  userEmail: string | null;
  workspaceRole: string;
  effectiveEntitlements: PlanEntitlements & { isPro: boolean };
  teamAdminEmails: string[];
}) {
  const { isDark, setIsDark } = useDashboardTheme();
  const isPastDue = workspace.subscription_status === 'past_due';
  const isTeamPlan = effectiveEntitlements.canUseSso;
  const canViewTeamEmails = workspaceRole === 'owner' || workspaceRole === 'admin';

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-semibold mb-8 text-slate-900">Workspace Settings</h1>

      {/* Dark Mode */}
      <div className="dashboard-panel rounded-xl p-6 mb-10">
        <div className="flex items-center justify-between gap-6">
          <h2 className="text-xl font-semibold text-slate-900">Dark Mode</h2>
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={() => setIsDark(!isDark)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors border dashboard-border ${
              isDark ? 'bg-[var(--dash-accent)]' : 'bg-[var(--dash-surface-2)]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-[var(--dash-surface)] transition-transform ${
                isDark ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Current Plan */}
      <div className="dashboard-panel rounded-xl p-6 mb-10">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-1">Current Plan</h2>
          </div>
          <div
            className={`px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide ${
              workspace.plan === 'team'
                ? 'dashboard-accent-chip'
                : workspace.plan === 'pro'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'bg-[var(--dash-surface-2)] text-slate-500 border dashboard-border'
            }`}
          >
            {workspace.plan}
            {isPastDue && <span className="ml-2 text-yellow-500 font-bold">PAST DUE</span>}
          </div>
        </div>
      </div>

      {/* Account Email */}
      <div className="dashboard-panel rounded-xl p-6 mb-10">
        {!isTeamPlan ? (
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Signed-in Email</h2>
            <p className="font-mono text-sm dashboard-text-muted">{userEmail || 'Not available'}</p>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Team Admin Emails</h2>
            {canViewTeamEmails ? (
              teamAdminEmails.length > 0 ? (
                <div className="space-y-2">
                  {teamAdminEmails.map((email) => (
                    <p key={email} className="font-mono text-sm dashboard-text-muted">
                      {email}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="dashboard-text-muted text-sm">No admin emails available.</p>
              )
            ) : (
              <p className="dashboard-text-muted text-sm">
                Admin team emails are visible to owners and admins only.
              </p>
            )}
          </div>
        )}
      </div>

      {isPastDue && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-600 text-sm">
          Payment is past due. Please update billing to avoid downgrade.
        </div>
      )}
    </div>
  );
}
