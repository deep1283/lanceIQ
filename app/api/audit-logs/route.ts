import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { canViewAuditLogs } from '@/lib/roles';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function parseCursor(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get('workspace_id');
    if (!workspaceId || !isValidUuid(workspaceId)) {
      return NextResponse.json({ error: 'workspace_id is required.' }, { status: 400 });
    }

    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const cursorId = searchParams.get('cursor_id');
    if (cursorId && !isValidUuid(cursorId)) {
      return NextResponse.json({ error: 'cursor_id must be a UUID.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership || !canViewAuditLogs(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let query = supabase
      .from('audit_logs')
      .select('id, actor_id, action, target_resource, details, ip_address, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (cursor && cursorId) {
      query = query.or(`created_at.lt.${cursor},and(created_at.eq.${cursor},id.lt.${cursorId})`);
    } else if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Audit log fetch failed:', error);
      return NextResponse.json({ error: 'Failed to load audit logs.' }, { status: 500 });
    }

    const last = data && data.length ? data[data.length - 1] : null;
    const nextCursor = last?.created_at ?? null;
    const nextCursorId = last?.id ?? null;

    return NextResponse.json({
      data: data ?? [],
      next_cursor: nextCursor,
      next_cursor_id: nextCursorId,
    });
  } catch (err) {
    console.error('Audit log error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
