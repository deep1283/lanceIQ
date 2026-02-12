'use client';


import { useDashboardTheme } from '@/components/DashboardThemeProvider';

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
}: {
  workspace: Workspace;
}) {
  const { isDark, setIsDark } = useDashboardTheme();
  const isPastDue = workspace.subscription_status === 'past_due';

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-semibold mb-8 text-slate-900">Workspace Settings</h1>

      {/* Appearance */}
      <div className="dashboard-panel rounded-xl p-6 mb-10">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-1">Appearance</h2>
            <p className="dashboard-text-muted text-sm">Toggle dark mode for Dashboard and Settings.</p>
          </div>
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

      {isPastDue && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-600 text-sm">
          Payment is past due. Please update billing to avoid downgrade.
        </div>
      )}
    </div>
  );
}
