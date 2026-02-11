import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import SettingsClient from './client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership) {
    redirect('/dashboard');
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, plan, subscription_status, raw_body_retention_days, store_raw_body')
    .eq('id', membership.workspace_id)
    .single();

  if (!workspace) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>
      <SettingsClient workspace={workspace} />
    </div>
  );
}
