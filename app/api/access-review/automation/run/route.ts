import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { nextRunFrom, sendAccessReviewEmail } from '@/lib/access-review/automation';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

const MAX_SCHEDULES_PER_RUN = 25;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function computeNextRun(rrule: string, base: Date, now: Date) {
  let next = nextRunFrom(rrule, base);
  let guard = 0;
  while (next <= now && guard < 120) {
    next = nextRunFrom(rrule, next);
    guard += 1;
  }
  return next;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkspaceName(admin: any, workspaceId: string) {
  const { data } = await admin
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name || 'Workspace';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOwnerAdminEmails(admin: any, workspaceId: string) {
  const { data: members, error } = await admin
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)
    .in('role', ['owner', 'admin']);

  if (error) {
    console.error('Access review members lookup failed:', error);
    return [] as string[];
  }

  const emails = new Set<string>();
  for (const member of (members as Array<{ user_id: string; role: string }>) || []) {
    if (!member.user_id) continue;
    try {
      const { data, error: userError } = await admin.auth.admin.getUserById(member.user_id);
      if (userError) {
        console.error('Access review user lookup failed:', userError);
        continue;
      }
      const email = data?.user?.email;
      if (email) emails.add(email);
    } catch (err) {
      console.error('Access review user lookup exception:', err);
    }
  }

  return Array.from(emails);
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-lanceiq-access-review-token');
  if (!token || token !== process.env.ACCESS_REVIEW_AUTOMATION_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: schedules, error } = await admin
    .from('access_review_schedules')
    .select('id, workspace_id, rrule, next_run_at, last_run_at, active')
    .eq('active', true)
    .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
    .order('next_run_at', { ascending: true })
    .limit(MAX_SCHEDULES_PER_RUN);

  if (error) {
    console.error('Access review schedules fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const schedule of schedules || []) {
    const workspaceId = schedule.workspace_id as string;
    const base = schedule.next_run_at ? new Date(schedule.next_run_at) : now;
    const nextRun = computeNextRun(schedule.rrule, base, now);

    const { data: cycle, error: cycleError } = await admin
      .from('access_review_cycles')
      .insert({
        workspace_id: workspaceId,
        reviewer_id: null,
        status: 'pending',
        period_start: schedule.last_run_at || null,
        period_end: nowIso,
      })
      .select('id')
      .single();

    if (cycleError || !cycle) {
      console.error('Access review cycle create failed:', cycleError);
      results.push({ schedule_id: schedule.id, status: 'failed', error: 'cycle_create_failed' });
      continue;
    }

    await logAuditAction({
      workspaceId,
      action: AUDIT_ACTIONS.ACCESS_REVIEW_CREATED,
      actorId: undefined,
      targetResource: 'access_review_cycles',
      details: { cycle_id: cycle.id, schedule_id: schedule.id },
    });

    const workspaceName = await getWorkspaceName(admin, workspaceId);
    const recipients = await getOwnerAdminEmails(admin, workspaceId);

    const notifications: Array<Record<string, unknown>> = [];
    for (const email of recipients) {
      const result = await sendAccessReviewEmail(email, workspaceName, cycle.id);
      const notification = {
        workspace_id: workspaceId,
        cycle_id: cycle.id,
        channel: 'email',
        recipient: email,
        status: result.ok ? 'sent' : 'failed',
        sent_at: result.ok ? nowIso : null,
        error: result.ok ? null : result.error,
      };
      notifications.push(notification);
    }

    if (notifications.length) {
      const { error: notifError } = await admin
        .from('access_review_notifications')
        .insert(notifications);
      if (notifError) {
        console.error('Access review notifications insert failed:', notifError);
      }
    }

    const { error: updateError } = await admin
      .from('access_review_schedules')
      .update({
        last_run_at: nowIso,
        next_run_at: nextRun.toISOString(),
      })
      .eq('id', schedule.id);

    if (updateError) {
      console.error('Access review schedule update failed:', updateError);
      results.push({ schedule_id: schedule.id, status: 'partial', cycle_id: cycle.id });
      continue;
    }

    results.push({
      schedule_id: schedule.id,
      status: 'completed',
      cycle_id: cycle.id,
      notifications_sent: notifications.length,
      next_run_at: nextRun.toISOString(),
    });
  }

  return NextResponse.json({ results });
}
