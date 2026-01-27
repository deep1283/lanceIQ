import { dodo } from '@/lib/dodo';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find customer by email
    const customers = await dodo.customers.list({ email: email.toLowerCase().trim() });
    
    if (!customers.items || customers.items.length === 0) {
      return NextResponse.json({ paid: false, message: 'No purchase found for this email' });
    }

    const customer = customers.items[0];

    // Check if this customer has any successful payments
    const payments = await dodo.payments.list({ 
      customer_id: customer.customer_id,
      status: 'succeeded'
    });

    if (payments.items && payments.items.length > 0) {
      return NextResponse.json({ 
        paid: true, 
        message: 'Payment verified! Watermark removed.',
        customer_name: customer.name
      });
    }

    return NextResponse.json({ paid: false, message: 'No successful payment found for this email' });

  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
