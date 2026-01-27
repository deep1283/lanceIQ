import { dodo } from '@/lib/dodo';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { payment_id } = await request.json();

    if (!payment_id || typeof payment_id !== 'string') {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    // Retrieve the payment details from Dodo
    const payment = await dodo.payments.retrieve(payment_id);

    if (payment.status === 'succeeded') {
      return NextResponse.json({ 
        paid: true, 
        email: payment.customer.email,
        name: payment.customer.name,
        message: 'Payment verified!'
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
