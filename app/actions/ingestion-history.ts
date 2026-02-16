'use server';

import { createClient } from '@/utils/supabase/server';
import { checkPlanEntitlements } from '@/app/actions/subscription';

export interface IngestionEvent {
  id: string;
  workspace_id: string;
  source_name: string;
  provider: string;
  signature_status: 'verified' | 'failed' | 'not_verified';
  signature_reason: string | null;
  received_at: string;
  raw_body_sha256: string;
  raw_body_expires_at: string | null;
  provider_event_id: string | null;
  delivery_status: 'delivered' | 'queued' | 'retrying' | 'dlq' | 'not_configured';
  delivery_attempt_count: number;
  delivery_last_status_code: number | null;
}

type IngestionEventRow = {
  id: string;
  workspace_id: string;
  signature_status: 'verified' | 'failed' | 'not_verified';
  signature_reason: string | null;
  received_at: string;
  raw_body_sha256: string;
  raw_body_expires_at: string | null;
  provider_event_id: string | null;
  detected_provider: string | null;
  workspaces: {
    name: string;
    provider: string | null;
  } | {
    name: string;
    provider: string | null;
  }[];
};

type DeliveryJobRow = {
  id: string;
  ingested_event_id: string | null;
  status: string | null;
};

type DeliveryAttemptRow = {
  job_id: string;
  response_status: number | null;
  created_at: string;
};

type PaymentRecoveryItem = {
  workspace_id: string;
  source_name: string;
  ingested_event_id: string;
  provider: string;
  provider_event_id: string | null;
  amount_label: string | null;
  customer_label: string | null;
  delivery_status: string;
  attempt_count: number;
  last_status_code: number | null;
  received_at: string;
  replayable: boolean;
};

export interface PaymentRecoverySummary {
  canUseForwarding: boolean;
  matched_last_24h: number;
  missing_last_24h: number;
  total_last_24h: number;
  missing: PaymentRecoveryItem[];
}

function mapDeliveryStatus(statuses: string[]) {
  const normalized = statuses.map((status) => (status || '').toLowerCase());
  if (normalized.length === 0) return 'not_configured' as const;
  if (normalized.every((status) => status === 'completed')) return 'delivered' as const;
  if (normalized.includes('failed') || normalized.includes('cancelled')) return 'dlq' as const;
  if (normalized.includes('processing')) return 'retrying' as const;
  return 'queued' as const;
}

function toDisplayAmount(rawAmount: unknown, rawCurrency: unknown): string | null {
  const amount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);
  if (!Number.isFinite(amount)) return null;
  const currency =
    typeof rawCurrency === 'string' && rawCurrency.trim().length > 0
      ? rawCurrency.trim().toUpperCase()
      : null;

  if (!currency) return `${amount}`;
  const divisor = ['USD', 'EUR', 'GBP', 'INR'].includes(currency) ? 100 : 1;
  const scaled = amount / divisor;
  return `${currency} ${scaled.toFixed(divisor === 100 ? 2 : 0)}`;
}

function findStringField(obj: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractPaymentDetails(rawBody: string | null | undefined) {
  if (!rawBody) return { amountLabel: null, customer: null };
  try {
    const parsed = JSON.parse(rawBody) as Record<string, any>;
    const root = parsed && typeof parsed === 'object' ? parsed : {};
    const dataObject =
      root?.data?.object && typeof root.data.object === 'object'
        ? (root.data.object as Record<string, unknown>)
        : root?.payload?.payment?.entity && typeof root.payload.payment.entity === 'object'
          ? (root.payload.payment.entity as Record<string, unknown>)
          : root;

    const amountLabel = toDisplayAmount(
      (dataObject as any).amount ?? (dataObject as any).total,
      (dataObject as any).currency
    );

    const customer =
      findStringField(dataObject, ['customer_email', 'receipt_email', 'email']) ||
      findStringField((dataObject?.billing_details as Record<string, unknown>) || {}, ['email']) ||
      null;

    return { amountLabel, customer };
  } catch {
    return { amountLabel: null, customer: null };
  }
}

export async function getRecentIngestionEvents(limit = 20) {
  const supabase = await createClient();
  
  // We need to join workspaces to get source name
  // ingested_events -> join workspaces
  
  const { data, error } = await supabase
    .from('ingested_events')
    .select(`
      id,
      signature_status,
      signature_reason,
      received_at,
      raw_body_sha256,
      raw_body_expires_at,
      provider_event_id,
      detected_provider,
      workspaces!inner (
        name,
        provider
      )
    `)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Get History Error:', error);
    return [];
  }

  const eventRows = (data as IngestionEventRow[]) || [];
  const eventIds = eventRows.map((event) => event.id);

  const jobsByEventId = new Map<string, DeliveryJobRow[]>();
  const attemptsByJobId = new Map<string, DeliveryAttemptRow[]>();

  if (eventIds.length > 0) {
    const { data: jobsData } = await supabase
      .from('delivery_jobs')
      .select('id, ingested_event_id, status')
      .in('ingested_event_id', eventIds)
      .order('created_at', { ascending: false });

    const jobs = (jobsData || []) as DeliveryJobRow[];
    const jobIds: string[] = [];
    for (const job of jobs) {
      if (!job.ingested_event_id) continue;
      jobIds.push(job.id);
      if (!jobsByEventId.has(job.ingested_event_id)) {
        jobsByEventId.set(job.ingested_event_id, []);
      }
      jobsByEventId.get(job.ingested_event_id)?.push(job);
    }

    if (jobIds.length > 0) {
      const { data: attemptsData } = await supabase
        .from('delivery_attempts')
        .select('job_id, response_status, created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false });
      const attempts = (attemptsData || []) as DeliveryAttemptRow[];
      for (const attempt of attempts) {
        if (!attemptsByJobId.has(attempt.job_id)) {
          attemptsByJobId.set(attempt.job_id, []);
        }
        attemptsByJobId.get(attempt.job_id)?.push(attempt);
      }
    }
  }

  // Transform for UI
  return eventRows.map((event) => {
    // Handle both object and array forms of the join result
    const ws = Array.isArray(event.workspaces) ? event.workspaces[0] : event.workspaces;
    const jobs = jobsByEventId.get(event.id) || [];
    const deliveryStatuses = jobs.map((job) => job.status || '');
    const deliveryStatus = mapDeliveryStatus(deliveryStatuses);
    const deliveryAttemptCount = jobs.reduce(
      (total, job) => total + ((attemptsByJobId.get(job.id) || []).length || 0),
      0
    );
    const deliveryLastStatusCode =
      jobs
        .flatMap((job) => attemptsByJobId.get(job.id) || [])
        .find((attempt) => typeof attempt.response_status === 'number')?.response_status || null;

    return {
      id: event.id,
      workspace_id: event.workspace_id,
      source_name: ws?.name ?? 'Unknown',
      provider: event.detected_provider || ws?.provider || 'unknown',
      signature_status: event.signature_status,
      signature_reason: event.signature_reason,
      received_at: event.received_at,
      raw_body_sha256: event.raw_body_sha256,
      raw_body_expires_at: event.raw_body_expires_at,
      provider_event_id: event.provider_event_id,
      delivery_status: deliveryStatus,
      delivery_attempt_count: deliveryAttemptCount,
      delivery_last_status_code: deliveryLastStatusCode,
    };
  });
}

export async function getPaymentRecoverySummary(limit = 10): Promise<PaymentRecoverySummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      canUseForwarding: false,
      matched_last_24h: 0,
      missing_last_24h: 0,
      total_last_24h: 0,
      missing: [],
    };
  }

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(100);
  const workspaceIds = (memberships || []).map((item) => item.workspace_id).filter(Boolean);
  if (workspaceIds.length === 0) {
    return {
      canUseForwarding: false,
      matched_last_24h: 0,
      missing_last_24h: 0,
      total_last_24h: 0,
      missing: [],
    };
  }

  let canUseForwarding = false;
  for (const workspaceId of workspaceIds) {
    const entitlements = await checkPlanEntitlements(workspaceId);
    if (entitlements.canUseForwarding) {
      canUseForwarding = true;
      break;
    }
  }

  if (!canUseForwarding) {
    return {
      canUseForwarding: false,
      matched_last_24h: 0,
      missing_last_24h: 0,
      total_last_24h: 0,
      missing: [],
    };
  }

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: jobsData } = await supabase
    .from('delivery_jobs')
    .select('id, workspace_id, ingested_event_id, status, created_at')
    .in('workspace_id', workspaceIds)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500);

  const jobs = (jobsData || []) as Array<{
    id: string;
    workspace_id: string;
    ingested_event_id: string | null;
    status: string | null;
    created_at: string;
  }>;

  if (jobs.length === 0) {
    return {
      canUseForwarding: true,
      matched_last_24h: 0,
      missing_last_24h: 0,
      total_last_24h: 0,
      missing: [],
    };
  }

  const eventIds = Array.from(
    new Set(jobs.map((job) => job.ingested_event_id).filter((id): id is string => Boolean(id)))
  );
  const { data: eventsData } = await supabase
    .from('ingested_events')
    .select('id, workspace_id, detected_provider, provider_event_id, raw_body, received_at')
    .in('id', eventIds)
    .limit(500);
  const eventsById = new Map(
    ((eventsData || []) as Array<{
      id: string;
      workspace_id: string;
      detected_provider: string | null;
      provider_event_id: string | null;
      raw_body: string | null;
      received_at: string;
    }>).map((event) => [event.id, event])
  );

  const { data: workspacesData } = await supabase
    .from('workspaces')
    .select('id, name')
    .in('id', workspaceIds);
  const workspaceNameById = new Map(
    ((workspacesData || []) as Array<{ id: string; name: string | null }>).map((workspace) => [
      workspace.id,
      workspace.name || 'Workspace',
    ])
  );

  const { data: attemptsData } = await supabase
    .from('delivery_attempts')
    .select('job_id, response_status, created_at')
    .in('job_id', jobs.map((job) => job.id))
    .order('created_at', { ascending: false })
    .limit(1000);
  const attemptsByJobId = new Map<string, DeliveryAttemptRow[]>();
  for (const attempt of (attemptsData || []) as DeliveryAttemptRow[]) {
    if (!attemptsByJobId.has(attempt.job_id)) {
      attemptsByJobId.set(attempt.job_id, []);
    }
    attemptsByJobId.get(attempt.job_id)?.push(attempt);
  }

  const jobsByEventId = new Map<string, typeof jobs>();
  for (const job of jobs) {
    if (!job.ingested_event_id) continue;
    if (!jobsByEventId.has(job.ingested_event_id)) {
      jobsByEventId.set(job.ingested_event_id, []);
    }
    jobsByEventId.get(job.ingested_event_id)?.push(job);
  }

  let matched = 0;
  let missing = 0;
  const missingItems: PaymentRecoveryItem[] = [];

  for (const [eventId, eventJobs] of jobsByEventId.entries()) {
    const statuses = eventJobs.map((job) => (job.status || '').toLowerCase());
    const delivered = statuses.length > 0 && statuses.every((status) => status === 'completed');
    if (delivered) {
      matched += 1;
      continue;
    }
    missing += 1;

    const event = eventsById.get(eventId);
    const deliveryStatus =
      statuses.includes('failed') || statuses.includes('cancelled')
        ? 'DLQ'
        : statuses.includes('processing')
          ? 'Retrying'
          : 'Queued';
    const attemptCount = eventJobs.reduce(
      (total, job) => total + ((attemptsByJobId.get(job.id) || []).length || 0),
      0
    );
    const lastStatusCode =
      eventJobs
        .flatMap((job) => attemptsByJobId.get(job.id) || [])
        .find((attempt) => typeof attempt.response_status === 'number')?.response_status || null;

    const parsed = extractPaymentDetails(event?.raw_body || null);

    missingItems.push({
      workspace_id: event?.workspace_id || eventJobs[0].workspace_id,
      source_name:
        workspaceNameById.get(event?.workspace_id || eventJobs[0].workspace_id) || 'Workspace',
      ingested_event_id: eventId,
      provider: event?.detected_provider || 'unknown',
      provider_event_id: event?.provider_event_id || null,
      amount_label: parsed.amountLabel,
      customer_label: parsed.customer,
      delivery_status: deliveryStatus,
      attempt_count: attemptCount,
      last_status_code: lastStatusCode,
      received_at: event?.received_at || eventJobs[0].created_at,
      replayable: Boolean(event?.raw_body),
    });
  }

  return {
    canUseForwarding: true,
    matched_last_24h: matched,
    missing_last_24h: missing,
    total_last_24h: matched + missing,
    missing: missingItems
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
      .slice(0, Math.max(1, Math.min(limit, 25))),
  };
}
