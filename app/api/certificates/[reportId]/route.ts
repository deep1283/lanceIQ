import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const { reportId } = params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: certificate, error } = await supabase
    .from('certificates')
    .select(
      [
        'report_id',
        'created_at',
        'payload',
        'headers',
        'raw_body_sha256',
        'hash',
        'signature_status',
        'signature_status_reason',
        'verified_at',
        'verification_method',
        'verification_error',
        'signature_secret_hint',
        'stripe_timestamp_tolerance_sec',
        'provider',
        'status_code',
        'expires_at',
      ].join(',')
    )
    .eq('report_id', reportId)
    .eq('user_id', user.id)
    .single();

  if (error || !certificate) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  if (certificate.expires_at && new Date(certificate.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Certificate has expired according to your data retention plan.' },
      { status: 410 }
    );
  }

  return NextResponse.json({ certificate });
}
