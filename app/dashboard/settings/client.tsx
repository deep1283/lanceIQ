'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface Workspace {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  subscription_status: string;
  raw_body_retention_days: number;
}

interface AlertSetting {
  id?: string;
  channel: 'email' | 'slack';
  destination: string;
  enabled: boolean;
  window_minutes: number;
  critical_fail_count: number;
}

export default function SettingsClient({ 
  workspace, 
  initialSettings 
}: { 
  workspace: Workspace, 
  initialSettings: AlertSetting | null 
}) {
  const router = useRouter();
  const supabase = createClient();
  const isPro = workspace.plan === 'pro' || workspace.plan === 'enterprise';
  const isPastDue = workspace.subscription_status === 'past_due';

  const [settings, setSettings] = useState<AlertSetting>(initialSettings || {
    channel: 'email',
    destination: '',
    enabled: true,
    window_minutes: 10,
    critical_fail_count: 3
  });
  
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!isPro && !isPastDue) return; // Strict gating
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    
    const payload = {
      workspace_id: workspace.id,
      ...settings,
      cooldown_minutes: 30, // hardcoded for now
      created_by: user?.id
    };

    // Upsert logic
    await supabase.from('workspace_alert_settings').upsert(payload);
    setSaving(false);
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
            isPro ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-blue-900/30 text-blue-400 border border-blue-800'
          }`}>
            {workspace.plan}
            {isPastDue && <span className="ml-2 text-yellow-500 font-bold">PAST DUE</span>}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Data Retention</p>
            <p className="text-2xl font-mono text-white">
              {workspace.plan === 'free' ? '24 Hours' : workspace.plan === 'enterprise' ? '30 Days' : '7 Days'}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Ingestion Speed</p>
            <p className="text-2xl font-mono text-white">
               Real-time
            </p>
          </div>
        </div>
        
        {!isPro && (
          <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white flex justify-between items-center shadow-lg">
             <div>
               <h3 className="font-bold text-lg">Upgrade to Enterprise ($19/mo)</h3>
               <p className="text-blue-100 text-sm mt-1">Unlock 7-day retention and Smart Alerts.</p>
             </div>
             <a 
               href={`/api/dodo/checkout?workspace_id=${workspace.id}`}
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

      {/* 2. Alert Settings (Gated) */}
      <div className="relative">
        <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-6 ${!isPro && 'opacity-50 pointer-events-none blur-[1px]'}`}>
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
        
        {!isPro && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-zinc-950/90 border border-zinc-800 p-8 rounded-xl text-center backdrop-blur-sm max-w-sm mx-4">
              <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Smart Alerts are Locked</h3>
              <p className="text-zinc-400 mb-6 text-sm">Upgrade to the Enterprise plan to enable real-time critical alerts via Email & Slack.</p>
              <a href={`/api/dodo/checkout?workspace_id=${workspace.id}`} className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-md transition-colors">
                Unlock for $19/mo
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
