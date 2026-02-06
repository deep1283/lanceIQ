'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateAlertSettings } from '@/app/actions/alert-settings';

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

export default function SettingsClient({ 
  workspace, 
  initialSettings,
  initialAuditLogs
}: { 
  workspace: Workspace, 
  initialSettings: AlertSetting | null,
  initialAuditLogs: AuditLog[]
}) {
  const router = useRouter();
  const isPaid = workspace.plan !== 'free';
  const isTeam = workspace.plan === 'team';
  const isPastDue = workspace.subscription_status === 'past_due';
  const canUseAlerts = isTeam && (workspace.subscription_status === 'active' || isPastDue);

  const [activeTab, setActiveTab] = useState<'alerts' | 'audit'>('alerts');

  const [settings, setSettings] = useState<AlertSetting>(initialSettings || {
    channel: 'email',
    destination: '',
    enabled: true,
    window_minutes: 10,
    critical_fail_count: 3
  });
  
  const [saving, setSaving] = useState(false);

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
    // Router refresh happens in server action via revalidatePath, 
    // but calling it here again doesn't hurt to sync client cache if needed.
    router.refresh();
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <h1 className="text-3xl font-bold mb-8">Workspace Settings</h1>
      
      {/* 1. Subscription Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Subscription Plan</h2>
            <p className="text-zinc-400 text-sm">Manage your billing and features</p>
          </div>
        <div className={`px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide ${
            isPaid ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-blue-900/30 text-blue-400 border border-blue-800'
          }`}>
            {workspace.plan}
            {isPastDue && <span className="ml-2 text-yellow-500 font-bold">PAST DUE</span>}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Data Retention</p>
            <p className="text-2xl font-mono text-white">
              {workspace.plan === 'free' ? '24 Hours' : workspace.plan === 'team' ? '30 Days' : '7 Days'}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Ingestion Speed</p>
            <p className="text-2xl font-mono text-white">
               Real-time
            </p>
          </div>
        </div>
        
        {!isTeam && (
          <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white flex justify-between items-center shadow-lg">
             <div>
               <h3 className="font-bold text-lg">Upgrade to Team ($79/mo)</h3>
               <p className="text-blue-100 text-sm mt-1">Unlock 30-day retention and Smart Alerts.</p>
             </div>
             <a 
               href={`/api/dodo/checkout?workspace_id=${workspace.id}&plan=team`}
               className="bg-white text-blue-600 px-5 py-2.5 rounded-md font-bold hover:bg-zinc-50 transition-colors shadow-md"
             >
               Upgrade Now
             </a>
          </div>
        )}

        {isPastDue && (
          <div className="mt-6 bg-yellow-900/30 border border-yellow-800 rounded-lg p-4 text-yellow-200 text-sm">
            Payment is past due. Alerts will continue during grace period, but please update billing to avoid downgrade.
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-6 border-b border-zinc-800 mb-8">
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
      </div>

      {/* Tab Content */}
      {activeTab === 'alerts' ? (
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
                <p className="text-zinc-400 mb-6 text-sm">Upgrade to the Team plan to enable real-time critical alerts via Email & Slack.</p>
                <a href={`/api/dodo/checkout?workspace_id=${workspace.id}&plan=team`} className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-md transition-colors">
                  Unlock for $79/mo
                </a>
              </div>
            </div>
          )}
        </div>
      ) : (
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
                <a href={`/api/dodo/checkout?workspace_id=${workspace.id}&plan=team`} className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-md transition-colors">
                  Unlock for $79/mo
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
