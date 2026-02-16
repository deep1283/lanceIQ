import { createClient } from '@/utils/supabase/server';

export const AUDIT_ACTIONS = {
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  WORKSPACE_DELETED: 'workspace.deleted',
  MEMBER_INVITED: 'member.invited',
  MEMBER_UPDATED: 'member.updated',
  MEMBER_REMOVED: 'member.removed',
  ALERT_UPDATED: 'alert.updated',
  ALERT_TEST_SENT: 'alert.test_sent',
  SECRET_ROTATED: 'secret.rotated',
  SECRET_VIEWED: 'secret.viewed',
  LEGAL_HOLD_CREATED: 'legal_hold.created',
  LEGAL_HOLD_DEACTIVATED: 'legal_hold.deactivated',
  KEY_ROTATED: 'key.rotated',
  ACCESS_REVIEW_CREATED: 'access_review.created',
  ACCESS_REVIEW_DECISION: 'access_review.decision',
  DELIVERY_ENQUEUE_FAILED: 'delivery.enqueue_failed',
  DELIVERY_RUN_TRIGGERED: 'delivery.run_triggered',
  DELIVERY_REPLAY_REQUESTED: 'delivery.replay_requested',
  DELIVERY_HEALTH_CHECK: 'delivery.health_check',
  DELIVERY_TEST_SENT: 'delivery.test_sent',
  RECONCILIATION_RUN_TRIGGERED: 'reconciliation.run_triggered',
  RECONCILIATION_CASE_OPENED: 'reconciliation.case_opened',
  RECONCILIATION_CASE_REPLAY_TRIGGERED: 'reconciliation.case_replay_triggered',
  RECONCILIATION_CASE_RESOLVED: 'reconciliation.case_resolved',
  STATE_SNAPSHOT_CREATED: 'reconciliation.state_snapshot_created',
  EVIDENCE_PACK_GENERATED: 'evidence_pack.generated',
  EVIDENCE_PACK_VERIFIED: 'evidence_pack.verified',
  PLAN_CHANGED: 'plan.changed',
  AUTH_LOGIN: 'auth.login',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Log a critical action to the audit log.
 * Safe to call from Server Actions.
 */
export async function logAuditAction(params: {
  workspaceId: string;
  action: AuditAction;
  targetResource?: string;
  details?: Record<string, unknown>;
  actorId?: string; // Optional, defaults to current auth user
  ipAddress?: string; // Optional if available
}) {
  try {
    let actorId = params.actorId;

    // Only try to fetch current user if actorId is not provided
    // This allows the function to be used in background jobs/scripts where cookies() are unavailable
    if (!actorId) {
       try {
         const supabase = await createClient();
         const { data: { user } } = await supabase.auth.getUser();
         actorId = user?.id;
       } catch {
         // Ignore error if cookies() fails (e.g. in script/background job)
         // actorId will remain undefined
       }
    }

    if (!actorId) {
       // Log as system or anonymous if needed
    }

    // Use admin client for insertion (bypassing RLS insert restrictions)
    const adminClient = await createAdminClient();
    if (!adminClient) {
      console.error('Audit log skipped: missing Supabase admin credentials.');
      return;
    }

    const { error } = await adminClient
      .from('audit_logs')
      .insert({
        workspace_id: params.workspaceId,
        actor_id: actorId,
        action: params.action,
        target_resource: params.targetResource,
        details: params.details || {},
        ip_address: params.ipAddress,
      });

    if (error) {
      console.error('Failed to write audit log:', error);
      // Fail safely? Or throw? Usually audit log failure shouldn't block the main action unless strict compliance.
      // We'll log error but not throw to avoid breaking UX.
    }
  } catch (err) {
    console.error('Error logging audit action:', err);
  }
}

// Helper to get admin client
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

async function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
}
