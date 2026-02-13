import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { canManageWorkspace } from '@/lib/roles';
import { hasWorkspaceEntitlement, teamPlanForbiddenBody } from '@/lib/team-plan-gate';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

function requireGlobalToken(request: NextRequest) {
  const token = request.headers.get('x-lanceiq-incidents-token');
  return token && process.env.INCIDENTS_ADMIN_TOKEN && token === process.env.INCIDENTS_ADMIN_TOKEN;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get('workspace_id');
  const includeGlobal = searchParams.get('include_global') !== 'false';

  if (!workspaceId || !isValidUuid(workspaceId)) {
    return NextResponse.json({ error: 'workspace_id invalid' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const entitled = await hasWorkspaceEntitlement(workspaceId, (entitlements) => entitlements.canUseSlaIncidents);
  if (!entitled) {
    return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
  }

  let query = supabase.from('incident_reports').select('*').order('started_at', { ascending: false });
  if (includeGlobal) {
    query = query.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);
  } else {
    query = query.eq('workspace_id', workspaceId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Incidents fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load incidents' }, { status: 500 });
  }

  return NextResponse.json({ incidents: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id ?? null;

  if (workspaceId && !isValidUuid(workspaceId)) {
    return NextResponse.json({ error: 'workspace_id invalid' }, { status: 400 });
  }

  if (!workspaceId) {
    if (!requireGlobalToken(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !canManageWorkspace(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entitled = await hasWorkspaceEntitlement(workspaceId, (entitlements) => entitlements.canUseSlaIncidents);
    if (!entitled) {
      return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
    }
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { data, error } = await admin.from('incident_reports').insert({
    workspace_id: workspaceId,
    title: body.title,
    severity: body.severity,
    status: body.status || 'investigating',
    started_at: body.started_at || new Date().toISOString(),
    resolved_at: body.resolved_at || null,
    affected_components: body.affected_components || [],
    public_note: body.public_note || null,
  }).select('*').single();

  if (error) {
    console.error('Incident insert failed:', error);
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }

  return NextResponse.json({ incident: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const incidentId = body.incident_id;
  if (!incidentId) {
    return NextResponse.json({ error: 'incident_id required' }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const { data: existing, error: existingError } = await admin
    .from('incident_reports')
    .select('id, workspace_id')
    .eq('id', incidentId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }

  if (!existing.workspace_id) {
    if (!requireGlobalToken(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', existing.workspace_id)
      .eq('user_id', user.id)
      .single();
    if (!membership || !canManageWorkspace(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entitled = await hasWorkspaceEntitlement(existing.workspace_id, (entitlements) => entitlements.canUseSlaIncidents);
    if (!entitled) {
      return NextResponse.json(teamPlanForbiddenBody(), { status: 403 });
    }
  }

  const { data, error } = await admin
    .from('incident_reports')
    .update({
      title: body.title,
      severity: body.severity,
      status: body.status,
      started_at: body.started_at,
      resolved_at: body.resolved_at,
      affected_components: body.affected_components,
      public_note: body.public_note,
    })
    .eq('id', incidentId)
    .select('*')
    .single();

  if (error) {
    console.error('Incident update failed:', error);
    return NextResponse.json({ error: 'Failed to update incident' }, { status: 500 });
  }

  return NextResponse.json({ incident: data });
}
