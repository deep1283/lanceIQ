import { dodo } from '@/lib/dodo';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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


    // Handle the event
    if (event.type === 'payment.succeeded') {
      const session = event.data;
      console.log('Payment succeeded for session:', session.payment_id);
      // Fulfill the purchase here (e.g., generate certificate, send email)
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }
}
