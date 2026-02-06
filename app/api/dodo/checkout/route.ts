import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createCheckoutSession } from '@/lib/dodo';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspace_id');
  const planParam = searchParams.get('plan');
  const plan = planParam === 'team' ? 'team' : 'pro';
  
  if (!workspaceId) {
    return NextResponse.json({ error: 'Missing workspace_id' }, { status: 400 });
  }

  // Verify workspace ownership/membership
  const { data: isMember } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!isMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const returnUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/dashboard/settings?payment=success`;
    
    // Use user email for billing
    const email = user.email!;

    const checkoutUrl = await createCheckoutSession({
      workspaceId,
      userId: user.id,
      email,
      returnUrl,
      plan
    });

    return NextResponse.redirect(checkoutUrl);
  } catch (error) {
    console.error('Checkout Error:', error);
    return NextResponse.json({ error: 'Failed to initiate checkout' }, { status: 500 });
  }
}
