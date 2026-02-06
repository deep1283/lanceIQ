import { dodo, resolvePlanFromProductId } from '@/lib/dodo';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for admin updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { payment_id } = await request.json();

    if (!payment_id || typeof payment_id !== 'string') {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    // Retrieve the payment details from Dodo
    const payment = await dodo.payments.retrieve(payment_id);

    if (payment.status === 'succeeded') {
      const resolvedPlan = resolvePlanFromProductId((payment as { product_id?: string }).product_id);
      const plan = resolvedPlan ?? 'pro';

      const normalizedEmail = payment.customer?.email?.toLowerCase().trim();

      if (normalizedEmail) {
        await supabaseAdmin
          .from('pro_users')
          .upsert(
            { email: normalizedEmail, payment_id },
            { onConflict: 'email' }
          );
      }

      const supabaseAuth = await createServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();

      let appliedToWorkspaces = 0;
      if (user) {
        const { data: memberships } = await supabaseAdmin
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id);

        const workspaceIds = memberships?.map((m) => m.workspace_id) ?? [];
        if (workspaceIds.length > 0) {
          await supabaseAdmin
            .from('workspaces')
            .update({ plan, subscription_status: 'active', billing_customer_id: payment.customer.customer_id })
            .in('id', workspaceIds);
          appliedToWorkspaces = workspaceIds.length;
        }
      }

      return NextResponse.json({ 
        paid: true, 
        email: payment.customer.email,
        name: payment.customer.name,
        message: 'Payment verified!',
        appliedToWorkspaces
      });
    }

    return NextResponse.json({ 
      paid: false, 
      message: 'Payment not successful',
      status: payment.status 
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
