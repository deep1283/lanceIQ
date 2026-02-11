import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function matchesRule(rule: any, payload: any) {
  if (!payload) return false;
  if (rule.rule_type === 'manual_api') return true;
  if (rule.rule_type === 'user_termination') {
    const expected = rule.criteria?.user_email?.toLowerCase();
    const actual = payload.user_email?.toLowerCase();
    return expected && actual && expected === actual;
  }
  if (rule.rule_type === 'keyword_match') {
    const keyword = rule.criteria?.keyword?.toLowerCase();
    const text = payload.text?.toLowerCase();
    return keyword && text && text.includes(keyword);
  }
  return false;
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-lanceiq-legal-hold-token');
  if (!token || token !== process.env.LEGAL_HOLD_AUTOMATION_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const ruleId = body.rule_id || null;
  const payload = body.payload || null;

  let query = admin.from('legal_hold_automation_rules').select('*').eq('active', true);
  if (ruleId) {
    query = query.eq('id', ruleId);
  }

  const { data: rules, error } = await query;
  if (error) {
    console.error('Legal hold rules fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 });
  }

  const results: any[] = [];

  for (const rule of rules || []) {
    if (!matchesRule(rule, payload)) {
      results.push({ rule_id: rule.id, action: 'skipped' });
      continue;
    }

    const { data: existing } = await admin
      .from('workspace_legal_holds')
      .select('id')
      .eq('workspace_id', rule.workspace_id)
      .eq('active', true)
      .maybeSingle();

    if (existing?.id) {
      results.push({ rule_id: rule.id, action: 'already_active' });
      continue;
    }

    const { data: hold, error: holdError } = await admin
      .from('workspace_legal_holds')
      .insert({
        workspace_id: rule.workspace_id,
        reason: `Auto hold: ${rule.rule_type}`,
        created_by: null,
        active: true,
      })
      .select('id')
      .single();

    if (holdError) {
      console.error('Legal hold create failed:', holdError);
      results.push({ rule_id: rule.id, action: 'failed' });
      continue;
    }

    await admin.from('legal_hold_automation_events').insert({
      rule_id: rule.id,
      workspace_id: rule.workspace_id,
      action: 'created_hold',
      details: {
        hold_id: hold.id,
        payload,
      },
    });

    results.push({ rule_id: rule.id, action: 'created_hold', hold_id: hold.id });
  }

  return NextResponse.json({ results });
}
