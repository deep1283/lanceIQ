import { dodo } from '@/lib/dodo';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for webhook (no user context)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const signature = (await headers()).get('webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
  }

  const payload = await request.text();

  try {
    const event = dodo.webhooks.unwrap(payload, {
      headers: {
        'webhook-signature': signature,
      },
      key: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
    });

    console.log('Received Dodo Payments Webhook:', event.type);

    // Handle payment success
    if (event.type === 'payment.succeeded') {
      const session = event.data;
      console.log('Payment succeeded for session:', session.payment_id);
      
      // Extract customer email from the event
      const customerEmail = session.customer?.email;
      
      if (customerEmail) {
        // Store in pro_users table
        const { error } = await supabaseAdmin
          .from('pro_users')
          .upsert(
            { 
              email: customerEmail.toLowerCase().trim(),
              payment_id: session.payment_id 
            },
            { onConflict: 'email' }
          );
        
        if (error) {
          console.error('Failed to store pro user:', error);
        } else {
          console.log('Pro user stored:', customerEmail);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }
}
