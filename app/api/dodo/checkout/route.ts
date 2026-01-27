import { dodo } from '@/lib/dodo';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = body.email || 'customer@example.com';
    const name = body.name || 'Customer';

    const session = await dodo.checkoutSessions.create({
      customer: {
        email,
        name,
      },
      product_cart: [
        {
          product_id: process.env.DODO_PRODUCT_ID || 'prd_test_123', // Your Dodo product ID
          quantity: 1,
        },
      ],
      return_url: `${request.nextUrl.origin}/success`,
    });

    return NextResponse.json({ url: session.checkout_url });
  } catch (error) {
    console.error('Dodo Payments Checkout Error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}

