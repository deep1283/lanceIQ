import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch certificate securely (RLS ensures user owns it or is in workspace)
  // Also enforce EXPIRY logic
  const { data: certificate, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error || !certificate) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  // Check Expiration
  // Note: RLS might handle visibility, but explicit check is safer for "download" flow
  // to prevent accessing old data if not allowed.
  if (certificate.expires_at && new Date(certificate.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Certificate has expired according to your data retention plan.' }, { status: 410 });
  }

  return NextResponse.json({ certificate });
}
