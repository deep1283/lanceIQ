import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { reportId: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('certificates')
    .select(
      [
        'report_id',
        'created_at',
        'payload',
        'headers',
        'payload_hash',
        'hash',
        'raw_body_sha256',
        'signature_status',
        'signature_status_reason',
        'verified_at',
        'verification_method',
        'verification_error',
        'signature_secret_hint',
        'stripe_timestamp_tolerance_sec',
        'provider',
        'expires_at',
      ].join(',')
    )
    .eq('report_id', params.reportId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Certificate expired' }, { status: 410 });
  }

  return NextResponse.json({ certificate: data });
}
