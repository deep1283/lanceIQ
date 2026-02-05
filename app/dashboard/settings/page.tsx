import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import SettingsClient from './client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get the first workspace for the user (Simplification for MVP)
  // In a multi-workspace app, this would come from the URL or session context
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership) {
    // No workspace? Redirect to onboarding or dashboard
    redirect('/dashboard');
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, plan, subscription_status, raw_body_retention_days')
    .eq('id', membership.workspace_id)
    .single();

  if (!workspace) {
     redirect('/dashboard');
  }

  // Get existing alert settings
  const { data: alertSettings } = await supabase
    .from('workspace_alert_settings')
    .select('*')
    .eq('workspace_id', workspace.id)
    .maybeSingle();

  // Get audit logs (Limit 50 for now)
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <SettingsClient 
      workspace={workspace} 
      initialSettings={alertSettings} 
      initialAuditLogs={auditLogs || []}
    />
  );
}
