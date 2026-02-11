'use client';

import { useState } from 'react';
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

  const retentionLabel = workspace.store_raw_body
    ? `${workspace.raw_body_retention_days ?? 0} days`
    : 'Not retained';

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-bold mb-8">Workspace Settings</h1>

      {/* Appearance */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10 shadow-sm">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Appearance</h2>
            <p className="text-zinc-400 text-sm">Toggle dark mode for Dashboard and Settings.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={() => setIsDark(!isDark)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              isDark ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                isDark ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Plan Info + Billing */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Plan & Billing</h2>
            <p className="text-zinc-400 text-sm">Plan status and billing context.</p>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide ${
            workspace.plan === 'team'
              ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800'
              : workspace.plan === 'pro'
                ? 'bg-blue-900/30 text-blue-300 border border-blue-800'
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
          }`}>
            {workspace.plan}
            {isPastDue && <span className="ml-2 text-yellow-500 font-bold">PAST DUE</span>}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Retention Defaults</p>
            <p className="text-2xl font-mono text-white">{retentionLabel}</p>
            <p className="text-xs text-zinc-500 mt-2">
              Raw body retention for this workspace. Evidence hashes are always retained.
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Billing</p>
            <p className="text-2xl font-mono text-white">Manage via Sales</p>
            <p className="text-xs text-zinc-500 mt-2">
              Contact Sales to update plan or billing details.
            </p>
          </div>
        </div>
      </div>

      {isPastDue && (
        <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-4 text-yellow-200 text-sm">
          Payment is past due. Please update billing to avoid downgrade.
        </div>
      )}
    </div>
  );
}
