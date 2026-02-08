import { createClient } from '@supabase/supabase-js';

// Reusing the same admin client creation pattern from utils/audit.ts
// Usually we'd extract this to a shared `utils/supabase/admin.ts` but to avoid refactoring widely now, I'll inline.
async function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
}

export async function logAlertDelivery(params: {
  workspaceId: string;
  alertSettingId: string | null;
  channel: 'email' | 'slack' | 'webhook';
  status: 'sent' | 'failed' | 'retrying';
  responsePayload?: Record<string, unknown>;
  lastError?: string;
  providerMessageId?: string;
  attemptCount?: number;
  nextRetryAt?: Date;
}) {
  try {
    const adminClient = await createAdminClient();
    if (!adminClient) {
      console.error('Alert delivery log skipped: missing Supabase admin credentials.');
      return;
    }

    const { error } = await adminClient
      .from('alert_deliveries')
      .insert({
        workspace_id: params.workspaceId,
        alert_setting_id: params.alertSettingId,
        channel: params.channel,
        status: params.status,
        response_payload: params.responsePayload || {},
        last_error: params.lastError,
        provider_message_id: params.providerMessageId,
        attempt_count: params.attemptCount || 1,
        next_retry_at: params.nextRetryAt?.toISOString(),
      });

    if (error) {
      console.error('Failed to log alert delivery:', error);
    }
  } catch (err) {
    console.error('Error logging alert delivery:', err);
  }
}
