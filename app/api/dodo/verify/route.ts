import { dodo } from '@/lib/dodo';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for verification
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

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

    if (proUser) {
      return NextResponse.json({ 
        paid: true, 
        message: 'Payment verified! Watermark removed.',
        source: 'database'
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

      return NextResponse.json({ 
        paid: true, 
        message: 'Payment verified! Watermark removed.',
        source: 'dodo_api'
      });
    }

    return NextResponse.json({ paid: false, message: 'No successful payment found for this email' });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
