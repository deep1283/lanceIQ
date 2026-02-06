import { dodo, resolvePlanFromProductId } from '@/lib/dodo';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';

// Use service role for verification
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { email, workspaceId } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. First check our database (fast)
    const { data: proUser } = await supabaseAdmin
      .from('pro_users')
      .select('email, created_at')
      .eq('email', normalizedEmail)
      .single();

    const supabaseAuth = await createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    const applyPlanToWorkspaces = async (plan: 'pro' | 'team' = 'pro', customerId?: string) => {
      if (!user) return 0;

      let workspaceIds: string[] = [];

      if (workspaceId) {
        const { data: membership } = await supabaseAdmin
          .from('workspace_members')
          .select('workspace_id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (membership?.workspace_id) {
          workspaceIds = [workspaceId];
        }
      }

      if (workspaceIds.length === 0) {
        const { data: memberships } = await supabaseAdmin
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id);

        workspaceIds = memberships?.map((m) => m.workspace_id) ?? [];
      }

      if (workspaceIds.length === 0) return 0;

      const updatePayload: Record<string, unknown> = {
        plan,
        subscription_status: 'active',
      };

      if (customerId) {
        updatePayload.billing_customer_id = customerId;
      }

      await supabaseAdmin
        .from('workspaces')
        .update(updatePayload)
        .in('id', workspaceIds);

      return workspaceIds.length;
    };

    if (proUser) {
      const appliedToWorkspaces = await applyPlanToWorkspaces('pro');
      return NextResponse.json({ 
        paid: true, 
        message: 'Payment verified! Watermark removed.',
        source: 'database',
        appliedToWorkspaces
      });
    }

    // 2. Fall back to Dodo API (slower, but handles edge cases)
    const customers = await dodo.customers.list({ email: normalizedEmail });
    
    if (!customers.items || customers.items.length === 0) {
      return NextResponse.json({ paid: false, message: 'No purchase found for this email' });
    }

    const customer = customers.items[0];
    const payments = await dodo.payments.list({ 
      customer_id: customer.customer_id,
      status: 'succeeded'
    });

    if (payments.items && payments.items.length > 0) {
      // Found in Dodo but not in our DB - store it now for next time
      await supabaseAdmin
        .from('pro_users')
        .upsert(
          { email: normalizedEmail, payment_id: payments.items[0].payment_id },
          { onConflict: 'email' }
        );

      const resolvedPlan = resolvePlanFromProductId((payments.items[0] as { product_id?: string }).product_id);
      const plan = resolvedPlan ?? 'pro';
      if (!resolvedPlan) {
        console.warn('Unknown Dodo product_id for verify:', (payments.items[0] as { product_id?: string }).product_id);
      }
      const appliedToWorkspaces = await applyPlanToWorkspaces(plan, customer.customer_id);

      return NextResponse.json({ 
        paid: true, 
        message: 'Payment verified! Watermark removed.',
        source: 'dodo_api',
        appliedToWorkspaces
      });
    }

    return NextResponse.json({ paid: false, message: 'No successful payment found for this email' });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
