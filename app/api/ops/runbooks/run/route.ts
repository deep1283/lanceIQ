import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { runFailoverChecks } from '@/lib/ops/failover-checks';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-lanceiq-runbook-token');
  if (!token || token !== process.env.RUNBOOKS_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  try {
    const results = await runFailoverChecks(admin);
    if (results.length) {
      const { error } = await admin.from('runbook_check_results').insert(
        results.map((result) => ({
          check_id: result.check_id,
          status: result.status,
          summary: result.summary,
        }))
      );

      if (error) {
        console.error('Runbook result insert failed:', error);
        return NextResponse.json({ error: 'Failed to store runbook results' }, { status: 500 });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('Runbook run failed:', err);
    return NextResponse.json({ error: 'Runbook run failed' }, { status: 500 });
  }
}
