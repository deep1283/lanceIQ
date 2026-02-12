import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { AUDIT_ACTIONS, logAuditAction } from '@/utils/audit';

const DEPRECATION_MESSAGE =
  'Deprecated insecure endpoint. Payment-based plan activation is webhook-only. Use /api/dodo/webhook proof flow.';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membership?.workspace_id) {
      await logAuditAction({
        workspaceId,
        action: AUDIT_ACTIONS.PLAN_CHANGED,
        actorId: user.id,
        targetResource: 'billing.verify',
        details: {
          status: 'blocked',
          reason: 'email_only_verification_deprecated',
        },
      });
    }
  }

  return NextResponse.json(
    {
      status: 'deprecated',
      paid: false,
      plan_changed: false,
      error: DEPRECATION_MESSAGE,
    },
    { status: 410 }
  );
}
