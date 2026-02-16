import crypto from 'crypto';
import { decrypt } from '@/lib/encryption';
import {
  createSignedDeliveryHeaders,
  guardedFetch,
  registerDeliveryReplayNonce,
} from '@/lib/delivery/security';
import {
  decodeForwardingEnvelopeBody,
  isForwardingEnvelopeV1,
  pickForwardableSourceHeaders,
} from '@/lib/delivery/payload';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_SECONDS = 60;
const DEFAULT_RETRY_BASE_SECONDS = 30;
const OPEN_BREAKER_THRESHOLD = 5;

type DeliveryTarget = {
  id: string;
  workspace_id: string;
  name: string | null;
  url: string;
  secret: string | null;
  headers: Record<string, string> | null;
  is_active: boolean | null;
};

type SigningKey = {
  id: string;
  workspace_id: string;
  kid: string | null;
  algorithm: string | null;
  secret_encrypted: string | null;
  private_key_encrypted: string | null;
  state: string | null;
};

type DeliveryBreaker = {
  id: string;
  workspace_id: string;
  target_host: string;
  state: 'closed' | 'open' | 'half-open';
  consecutive_5xx_count: number | null;
  failure_count: number | null;
  last_failure_at: string | null;
  reset_at: string | null;
  manual_resume_at: string | null;
};

function getMaxAttempts() {
  const parsed = Number(process.env.DELIVERY_MAX_ATTEMPTS || '');
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_MAX_ATTEMPTS;
}

function getLockSeconds() {
  const parsed = Number(process.env.DELIVERY_LOCK_SECONDS || '');
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_LOCK_SECONDS;
}

function retryDelaySeconds(attemptNumber: number) {
  const base = DEFAULT_RETRY_BASE_SECONDS;
  const value = base * 2 ** Math.max(0, attemptNumber - 1);
  return Math.min(15 * 60, value);
}

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializePayload(payload: unknown) {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return '{}';
  }
}

function sha256Hex(value: Buffer | string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildOutboundPayload(payload: unknown) {
  if (isForwardingEnvelopeV1(payload)) {
    const rawBody = decodeForwardingEnvelopeBody(payload);
    if (!rawBody) {
      throw new Error('invalid_forwarding_payload');
    }
    const sourceHeaders = pickForwardableSourceHeaders(payload.source_headers);
    const contentType =
      (typeof payload.source_content_type === 'string' && payload.source_content_type) ||
      sourceHeaders['content-type'] ||
      'application/json';

    return {
      bodyBytes: rawBody,
      bodyText: rawBody.toString('utf8'),
      contentType,
      sourceHeaders,
    };
  }

  const bodyText = serializePayload(payload);
  return {
    bodyBytes: Buffer.from(bodyText, 'utf8'),
    bodyText,
    contentType: 'application/json',
    sourceHeaders: {} as Record<string, string>,
  };
}

function maybeDecryptSecret(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

async function getActiveSigningKey(admin: any, workspaceId: string): Promise<SigningKey | null> {
  const { data, error } = await admin
    .from('workspace_delivery_signing_keys')
    .select('id, workspace_id, kid, algorithm, secret_encrypted, private_key_encrypted, state')
    .eq('workspace_id', workspaceId)
    .eq('state', 'active')
    .eq('algorithm', 'hmac-sha256')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }
  return (data as SigningKey | null) ?? null;
}

export async function listActiveDeliveryTargets(admin: any, workspaceId: string) {
  const { data, error } = await admin
    .from('workspace_delivery_targets')
    .select('id, workspace_id, name, url, secret, headers, is_active')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    return { targets: [] as DeliveryTarget[], error: 'targets_fetch_failed' as const };
  }
  return { targets: ((data || []) as DeliveryTarget[]), error: null };
}

export async function getDeliveryTarget(admin: any, workspaceId: string, targetId: string) {
  const { data, error } = await admin
    .from('workspace_delivery_targets')
    .select('id, workspace_id, name, url, secret, headers, is_active')
    .eq('workspace_id', workspaceId)
    .eq('id', targetId)
    .maybeSingle();
  if (error || !data) return null;
  return data as DeliveryTarget;
}

export async function enqueueDeliveryJob(params: {
  admin: any;
  workspaceId: string;
  targetId: string;
  eventType: string;
  payload: unknown;
  triggerSource: 'ingest' | 'replay' | 'test_webhook' | 'reconciliation';
  idempotencyKey?: string | null;
  ingestedEventId?: string | null;
  createdBy?: string | null;
  priority?: number;
}) {
  const payload: Record<string, unknown> = {
    workspace_id: params.workspaceId,
    target_id: params.targetId,
    event_type: params.eventType,
    payload: params.payload,
    status: 'pending',
    priority: params.priority ?? 0,
    trigger_source: params.triggerSource,
    idempotency_key: params.idempotencyKey ?? null,
    ingested_event_id: params.ingestedEventId ?? null,
    created_by: params.createdBy ?? null,
  };

  const { data, error } = await params.admin
    .from('delivery_jobs')
    .insert(payload)
    .select('id, workspace_id, target_id, event_type, payload, status')
    .single();

  if (error?.code === '23505' && params.idempotencyKey) {
    const { data: existing } = await params.admin
      .from('delivery_jobs')
      .select('id, workspace_id, target_id, event_type, payload, status')
      .eq('workspace_id', params.workspaceId)
      .eq('idempotency_key', params.idempotencyKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return { job: existing, enqueued: false, error: null };
    }
  }

  if (error || !data) {
    return { job: null, enqueued: false, error: 'job_insert_failed' as const };
  }

  const { error: spoolError } = await params.admin
    .from('delivery_spool')
    .insert({ job_id: data.id, process_after: new Date().toISOString(), attempt_count: 0 });

  if (spoolError) {
    return { job: data, enqueued: false, error: 'spool_insert_failed' as const };
  }

  return { job: data, enqueued: true, error: null };
}

async function getOrCreateBreaker(admin: any, workspaceId: string, targetHost: string) {
  const { data } = await admin
    .from('delivery_breakers')
    .select('id, workspace_id, target_host, state, consecutive_5xx_count, failure_count, last_failure_at, reset_at, manual_resume_at')
    .eq('workspace_id', workspaceId)
    .eq('target_host', targetHost)
    .maybeSingle();

  if (data?.id) {
    return data as DeliveryBreaker;
  }

  const { data: created, error } = await admin
    .from('delivery_breakers')
    .insert({
      workspace_id: workspaceId,
      target_host: targetHost,
      state: 'closed',
      consecutive_5xx_count: 0,
      failure_count: 0,
    })
    .select('id, workspace_id, target_host, state, consecutive_5xx_count, failure_count, last_failure_at, reset_at, manual_resume_at')
    .single();

  if (error || !created) return null;
  return created as DeliveryBreaker;
}

async function setBreakerState(
  admin: any,
  breakerId: string,
  state: 'closed' | 'open' | 'half-open',
  patch?: Record<string, unknown>
) {
  await admin
    .from('delivery_breakers')
    .update({
      state,
      ...patch,
      updated_at: new Date().toISOString(),
      last_state_change_at: new Date().toISOString(),
    })
    .eq('id', breakerId);
}

async function handleBreakerAfterAttempt(params: {
  admin: any;
  breaker: DeliveryBreaker | null;
  statusCode: number | null;
  forcedHalfOpen?: boolean;
}) {
  const { breaker, statusCode, admin } = params;
  if (!breaker) return;

  const now = new Date().toISOString();
  const is5xx = Boolean(statusCode && statusCode >= 500);
  const isSuccess = Boolean(statusCode && statusCode >= 200 && statusCode < 500);

  if (is5xx) {
    const next5xxCount = (breaker.consecutive_5xx_count ?? 0) + 1;
    const nextFailureCount = (breaker.failure_count ?? 0) + 1;
    const shouldOpen = next5xxCount >= OPEN_BREAKER_THRESHOLD;
    await admin
      .from('delivery_breakers')
      .update({
        consecutive_5xx_count: next5xxCount,
        failure_count: nextFailureCount,
        last_failure_at: now,
        state: shouldOpen ? 'open' : breaker.state,
        reset_at: shouldOpen ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : breaker.reset_at,
        opened_reason: shouldOpen ? 'consecutive_5xx' : null,
        updated_at: now,
        last_state_change_at: shouldOpen ? now : breaker.manual_resume_at ?? now,
      })
      .eq('id', breaker.id);
    return;
  }

  if (isSuccess) {
    await setBreakerState(admin, breaker.id, 'closed', {
      consecutive_5xx_count: 0,
      failure_count: 0,
      reset_at: null,
      opened_reason: null,
      manual_resume_at: params.forcedHalfOpen ? now : breaker.manual_resume_at,
      last_failure_at: null,
    });
  }
}

function normalizeTargetHeaders(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue;
    if (typeof raw === 'string' && raw.length > 0) out[key] = raw;
  }
  return out;
}

type DeliverySendResult = {
  ok: boolean;
  statusCode: number | null;
  responseHash: string | null;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
};

async function sendToTarget(params: {
  admin: any;
  workspaceId: string;
  target: DeliveryTarget;
  eventType: string;
  payload: unknown;
  signingKey: SigningKey | null;
  maxRedirects?: number;
}) {
  const startedAt = Date.now();
  let outbound: ReturnType<typeof buildOutboundPayload>;
  try {
    outbound = buildOutboundPayload(params.payload);
  } catch {
    return {
      ok: false,
      statusCode: null,
      responseHash: null,
      durationMs: Date.now() - startedAt,
      errorCode: 'invalid_forwarding_payload',
      errorMessage: 'Unable to decode immutable forwarding payload.',
    } satisfies DeliverySendResult;
  }
  const signingSecret =
    maybeDecryptSecret(params.signingKey?.secret_encrypted) ||
    maybeDecryptSecret(params.target.secret);

  if (!signingSecret) {
    return {
      ok: false,
      statusCode: null,
      responseHash: null,
      durationMs: Date.now() - startedAt,
      errorCode: 'missing_signing_secret',
      errorMessage: 'No active delivery signing secret configured.',
    } satisfies DeliverySendResult;
  }

  const signed = createSignedDeliveryHeaders({
    body: outbound.bodyBytes,
    secret: signingSecret,
    keyId: params.signingKey?.kid ?? null,
  });

  const replay = await registerDeliveryReplayNonce({
    admin: params.admin,
    workspaceId: params.workspaceId,
    targetId: params.target.id,
    nonce: signed.nonce,
    timestampSec: signed.timestamp,
  });

  if (!replay.ok) {
    return {
      ok: false,
      statusCode: null,
      responseHash: null,
      durationMs: Date.now() - startedAt,
      errorCode: replay.code,
      errorMessage: 'Delivery replay protection rejected request.',
    } satisfies DeliverySendResult;
  }

  const targetHeaders = normalizeTargetHeaders(params.target.headers);

  try {
    const response = await guardedFetch(
      params.target.url,
      {
        method: 'POST',
        headers: {
          'x-lanceiq-event-type': params.eventType,
          ...targetHeaders,
          ...outbound.sourceHeaders,
          'content-type': outbound.contentType,
          ...signed.headers,
        },
        body: new Uint8Array(outbound.bodyBytes),
      },
      { maxRedirects: params.maxRedirects ?? 0 }
    );

    const responseBytes = Buffer.from(await response.arrayBuffer());
    const responseHash = sha256Hex(responseBytes);

    return {
      ok: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      responseHash,
      durationMs: Date.now() - startedAt,
      errorCode: null,
      errorMessage: null,
    } satisfies DeliverySendResult;
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      responseHash: null,
      durationMs: Date.now() - startedAt,
      errorCode: 'delivery_request_failed',
      errorMessage: err instanceof Error ? err.message : 'Delivery request failed.',
    } satisfies DeliverySendResult;
  }
}

async function recordAttempt(params: {
  admin: any;
  jobId: string;
  spoolId?: string | null;
  attemptNumber: number;
  runnerId: string;
  sendResult: DeliverySendResult;
}) {
  const { sendResult } = params;
  const errorMessage =
    sendResult.errorCode && sendResult.errorMessage
      ? `${sendResult.errorCode}: ${sendResult.errorMessage}`
      : sendResult.errorCode || sendResult.errorMessage;

  await params.admin.from('delivery_attempts').insert({
    job_id: params.jobId,
    spool_id: params.spoolId ?? null,
    runner_id: params.runnerId,
    response_status: sendResult.statusCode,
    response_body: sendResult.responseHash ? `sha256:${sendResult.responseHash}` : null,
    response_headers: null,
    duration_ms: sendResult.durationMs,
    success: sendResult.ok,
    attempt_number: params.attemptNumber,
    error_message: errorMessage ? errorMessage.slice(0, 1024) : null,
  });
}

export async function runDeliveryJobById(params: {
  admin: any;
  workspaceId: string;
  jobId: string;
  runnerId: string;
  forcedHalfOpen?: boolean;
}) {
  const { data: job } = await params.admin
    .from('delivery_jobs')
    .select('id, workspace_id, target_id, event_type, payload, status')
    .eq('id', params.jobId)
    .eq('workspace_id', params.workspaceId)
    .maybeSingle();

  if (!job?.id || !job.target_id) {
    return { ok: false, code: 'job_not_found' as const };
  }

  const target = await getDeliveryTarget(params.admin, params.workspaceId, job.target_id);
  if (!target?.id || !target.is_active) {
    await params.admin.from('delivery_jobs').update({ status: 'failed' }).eq('id', job.id);
    return { ok: false, code: 'target_not_active' as const };
  }

  const host = new URL(target.url).hostname;
  const breaker = await getOrCreateBreaker(params.admin, params.workspaceId, host);
  if (breaker?.state === 'open' && !params.forcedHalfOpen) {
    return { ok: false, code: 'breaker_open' as const };
  }

  const signingKey = await getActiveSigningKey(params.admin, params.workspaceId);
  const sendResult = await sendToTarget({
    admin: params.admin,
    workspaceId: params.workspaceId,
    target,
    eventType: job.event_type,
    payload: job.payload,
    signingKey,
  });

  await recordAttempt({
    admin: params.admin,
    jobId: job.id,
    runnerId: params.runnerId,
    attemptNumber: 1,
    sendResult,
  });

  await handleBreakerAfterAttempt({
    admin: params.admin,
    breaker,
    statusCode: sendResult.statusCode,
    forcedHalfOpen: params.forcedHalfOpen,
  });

  await params.admin
    .from('delivery_jobs')
    .update({
      status: sendResult.ok ? 'completed' : 'failed',
      completed_at: sendResult.ok ? new Date().toISOString() : null,
    })
    .eq('id', job.id);

  return {
    ok: sendResult.ok,
    code: sendResult.ok ? null : sendResult.errorCode || 'delivery_failed',
    result: sendResult,
  };
}

export async function runDeliveryWorker(params: {
  admin: any;
  workspaceId: string;
  limit: number;
  runnerId: string;
}) {
  const nowIso = new Date().toISOString();
  const maxAttempts = getMaxAttempts();
  const lockSeconds = getLockSeconds();

  const { data: spoolRows, error } = await params.admin
    .from('delivery_spool')
    .select('id, job_id, attempt_count, process_after, locked_until')
    .lte('process_after', nowIso)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .order('process_after', { ascending: true })
    .limit(Math.max(1, Math.min(params.limit, 50)));

  if (error) {
    return { error: 'spool_fetch_failed' as const, results: [] as any[] };
  }

  const spoolByJob = new Map<string, { id: string; attempt_count: number }>();
  for (const row of spoolRows || []) {
    spoolByJob.set(row.job_id, { id: row.id, attempt_count: row.attempt_count ?? 0 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const [jobId, spool] of spoolByJob.entries()) {
    const { data: jobMeta } = await params.admin
      .from('delivery_jobs')
      .select('id, workspace_id, target_id, event_type, payload, status')
      .eq('id', jobId)
      .maybeSingle();

    if (!jobMeta?.id) {
      await params.admin.from('delivery_spool').delete().eq('id', spool.id);
      continue;
    }

    if (jobMeta.workspace_id !== params.workspaceId) {
      continue;
    }

    const lockUntil = new Date(Date.now() + lockSeconds * 1000).toISOString();
    const { data: locked } = await params.admin
      .from('delivery_spool')
      .update({ locked_until: lockUntil, locked_by: params.runnerId })
      .eq('id', spool.id)
      .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
      .select('id')
      .maybeSingle();

    if (!locked?.id) continue;

    const job = jobMeta;

    if (!job.target_id) {
      await params.admin.from('delivery_spool').delete().eq('id', spool.id);
      continue;
    }

    const target = await getDeliveryTarget(params.admin, params.workspaceId, job.target_id);
    if (!target?.id || !target.is_active) {
      await params.admin.from('delivery_jobs').update({ status: 'failed' }).eq('id', job.id);
      await params.admin.from('delivery_spool').delete().eq('id', spool.id);
      results.push({ job_id: job.id, status: 'failed', error: 'target_not_active' });
      continue;
    }

    const host = new URL(target.url).hostname;
    const breaker = await getOrCreateBreaker(params.admin, params.workspaceId, host);
    if (breaker?.state === 'open') {
      const retryAt = breaker.reset_at || new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await params.admin
        .from('delivery_spool')
        .update({
          process_after: retryAt,
          locked_until: null,
          locked_by: null,
          last_error: 'breaker_open',
        })
        .eq('id', spool.id);
      results.push({ job_id: job.id, status: 'skipped', error: 'breaker_open', retry_at: retryAt });
      continue;
    }

    const signingKey = await getActiveSigningKey(params.admin, params.workspaceId);
    const sendResult = await sendToTarget({
      admin: params.admin,
      workspaceId: params.workspaceId,
      target,
      eventType: job.event_type,
      payload: job.payload,
      signingKey,
    });

    const attemptNumber = (spool.attempt_count ?? 0) + 1;
    await recordAttempt({
      admin: params.admin,
      jobId: job.id,
      spoolId: spool.id,
      attemptNumber,
      runnerId: params.runnerId,
      sendResult,
    });

    await handleBreakerAfterAttempt({
      admin: params.admin,
      breaker,
      statusCode: sendResult.statusCode,
    });

    if (sendResult.ok) {
      await params.admin.from('delivery_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
      await params.admin.from('delivery_spool').delete().eq('id', spool.id);
      results.push({ job_id: job.id, status: 'completed', response_status: sendResult.statusCode });
      continue;
    }

    if (attemptNumber >= maxAttempts) {
      await params.admin.from('delivery_jobs').update({ status: 'failed' }).eq('id', job.id);
      await params.admin.from('delivery_spool').delete().eq('id', spool.id);
      results.push({
        job_id: job.id,
        status: 'failed',
        error: sendResult.errorCode || 'delivery_failed',
        response_status: sendResult.statusCode,
      });
      continue;
    }

    const retryDelay = retryDelaySeconds(attemptNumber);
    const retryAt = new Date(Date.now() + retryDelay * 1000).toISOString();
    await params.admin
      .from('delivery_spool')
      .update({
        attempt_count: attemptNumber,
        process_after: retryAt,
        locked_until: null,
        locked_by: null,
        last_error: sendResult.errorMessage || sendResult.errorCode || 'delivery_failed',
      })
      .eq('id', spool.id);

    results.push({
      job_id: job.id,
      status: 'retry_scheduled',
      retry_at: retryAt,
      error: sendResult.errorCode || 'delivery_failed',
      response_status: sendResult.statusCode,
    });
  }

  return { error: null, results };
}

export async function runTargetHealthCheck(params: {
  admin: any;
  workspaceId: string;
  targetId: string;
  runnerId: string;
  manualResume?: boolean;
}) {
  const target = await getDeliveryTarget(params.admin, params.workspaceId, params.targetId);
  if (!target?.id) {
    return { ok: false as const, code: 'target_not_found' as const };
  }

  const host = new URL(target.url).hostname;
  const breaker = await getOrCreateBreaker(params.admin, params.workspaceId, host);
  if (params.manualResume && breaker?.id) {
    await setBreakerState(params.admin, breaker.id, 'half-open', {
      manual_resume_at: new Date().toISOString(),
      opened_reason: null,
    });
  }

  const signingKey = await getActiveSigningKey(params.admin, params.workspaceId);
  const sendResult = await sendToTarget({
    admin: params.admin,
    workspaceId: params.workspaceId,
    target,
    eventType: 'lanceiq.delivery.healthcheck',
    payload: {
      type: 'lanceiq.delivery.healthcheck',
      timestamp: new Date().toISOString(),
      message: 'Health-check from LanceIQ delivery runner.',
    },
    signingKey,
    maxRedirects: 1,
  });

  await handleBreakerAfterAttempt({
    admin: params.admin,
    breaker,
    statusCode: sendResult.statusCode,
    forcedHalfOpen: params.manualResume,
  });

  return {
    ok: sendResult.ok,
    code: sendResult.ok ? null : sendResult.errorCode || 'health_check_failed',
    statusCode: sendResult.statusCode,
    breaker_state: sendResult.ok ? 'closed' : breaker?.state ?? 'unknown',
    error: sendResult.errorMessage,
  };
}

export async function buildEvidencePackManifest(params: {
  admin: any;
  workspaceId: string;
  packId: string;
  title: string;
  description?: string | null;
  runId?: string | null;
}) {
  let runRecord: any = null;
  if (params.runId) {
    const { data } = await params.admin
      .from('reconciliation_runs')
      .select('id, status, started_at, completed_at, items_processed, discrepancies_found, report_json')
      .eq('id', params.runId)
      .eq('workspace_id', params.workspaceId)
      .maybeSingle();
    runRecord = data || null;
  }

  const { count: jobsCount } = await params.admin
    .from('delivery_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', params.workspaceId);

  const { count: attemptsCount } = await params.admin
    .from('delivery_attempts')
    .select('id', { count: 'exact', head: true })
    .in(
      'job_id',
      (
        await params.admin
          .from('delivery_jobs')
          .select('id')
          .eq('workspace_id', params.workspaceId)
          .limit(5000)
      ).data?.map((row: { id: string }) => row.id) || ['00000000-0000-0000-0000-000000000000']
    );

  return {
    version: 1,
    pack_id: params.packId,
    workspace_id: params.workspaceId,
    title: params.title,
    description: params.description || null,
    generated_at: new Date().toISOString(),
    reconciliation_run: runRecord,
    totals: {
      delivery_jobs: jobsCount ?? 0,
      delivery_attempts: attemptsCount ?? 0,
    },
  };
}

export const deliveryServiceTestUtils = {
  safeJsonParse,
  serializePayload,
  buildOutboundPayload,
};
