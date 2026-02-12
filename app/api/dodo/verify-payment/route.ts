import { dodo } from '@/lib/dodo';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { AUDIT_ACTIONS, logAuditAction } from '@/utils/audit';

function getMetadataField(metadata: Record<string, string> | null | undefined, key: string) {
  if (!metadata) return null;
  const value = metadata[key];
  if (!value || typeof value !== 'string') return null;
  return value.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const paymentId = typeof body.payment_id === 'string' ? body.payment_id.trim() : '';
    const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';

    if (!paymentId || !workspaceId) {
      return NextResponse.json(
        { error: 'payment_id and workspace_id are required' },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership?.workspace_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payment = await dodo.payments.retrieve(paymentId);
    if (payment.status !== 'succeeded') {
      await logAuditAction({
        workspaceId,
        action: AUDIT_ACTIONS.PLAN_CHANGED,
        actorId: user.id,
        targetResource: 'billing.verify_payment',
        details: {
          status: 'rejected',
          reason: 'payment_not_succeeded',
          payment_id: paymentId,
        },
      });

      return NextResponse.json(
        { paid: false, verified: false, error: 'Payment is not successful' },
        { status: 400 }
      );
    }

    const metadataWorkspaceId = getMetadataField(payment.metadata, 'workspace_id');
    const metadataUserId = getMetadataField(payment.metadata, 'user_id');

    if (!metadataWorkspaceId || metadataWorkspaceId !== workspaceId || !metadataUserId || metadataUserId !== user.id) {
      await logAuditAction({
        workspaceId,
        action: AUDIT_ACTIONS.PLAN_CHANGED,
        actorId: user.id,
        targetResource: 'billing.verify_payment',
        details: {
          status: 'rejected',
          reason: 'workspace_or_user_proof_mismatch',
          payment_id: paymentId,
          metadata_workspace_id: metadataWorkspaceId,
          metadata_user_id: metadataUserId,
        },
      });

      return NextResponse.json(
        {
          paid: false,
          verified: false,
          error: 'Payment proof does not match authenticated workspace/user context',
        },
        { status: 403 }
      );
    }

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('plan, subscription_status')
      .eq('id', workspaceId)
      .maybeSingle();

    await logAuditAction({
      workspaceId,
      action: AUDIT_ACTIONS.PLAN_CHANGED,
      actorId: user.id,
      targetResource: 'billing.verify_payment',
      details: {
        status: 'verified',
        payment_id: paymentId,
        workspace_bound_proof: true,
        plan_changed: false,
      },
    });

    return NextResponse.json({
      paid: true,
      verified: true,
      payment_id: paymentId,
      workspace_id: workspaceId,
      plan_changed: false,
      message: 'Payment proof verified. Plan activation is webhook-driven only.',
      workspace_plan_active: workspace?.subscription_status === 'active',
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
