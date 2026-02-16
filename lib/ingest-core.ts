import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashApiKey } from '@/lib/api-key';
import {
  verifySignature,
  type Provider,
  detectProvider,
  computeRawBodySha256,
  computeCanonicalJsonSha256,
  type VerificationResult,
  extractEventId,
} from '@/lib/signature-verification';
import { decrypt } from '@/lib/encryption';
import { checkRateLimit, getRedisClient, markAndCheckDuplicate } from '@/lib/ingest-helpers';
import { isCriticalReason, maybeSendCriticalAlert, type AlertSetting } from '@/lib/alerting';
import { anchorIngestedEvent } from '@/lib/timestamps/anchor';
import { getPlanLimits, type PlanTier } from '@/lib/plan';
import { getEffectiveEntitlementsForWorkspace } from '@/lib/entitlements';
import { enqueueDeliveryJob, listActiveDeliveryTargets } from '@/lib/delivery/service';
import { buildForwardingEnvelopeV1 } from '@/lib/delivery/payload';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEDUP_EVENT_TTL_SEC = 24 * 60 * 60; // 24h
const DEDUP_HASH_TTL_SEC = 6 * 60 * 60; // 6h
const DEFAULT_MAX_INGEST_BYTES = 1024 * 1024; // 1 MiB
const KEY_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;
const VALID_BATCH_STATUSES = new Set(['uploading', 'processing', 'completed', 'failed']);

export async function processIngestEvent(req: NextRequest, apiKey: string): Promise<NextResponse> {
  try {
    if (!process.env.API_KEY_HASH_SECRET) {
      return errorResponse('Server configuration error', 500, 'server_config');
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Server configuration error', 500, 'server_config');
    }

    // 1. Hash Request Key
    let keyHash: string;
    try {
      keyHash = hashApiKey(apiKey);
    } catch (err: unknown) {
      console.error('API Key Hashing Error:', err);
      return errorResponse('Server configuration error', 500, 'server_config');
    }

    // 2. Rate Limiting (Per Key)
    const rateLimit = await checkRateLimit(`ingest:${keyHash}`);
    if (!rateLimit.allowed) {
      return errorResponse('Rate limit exceeded', 429, 'rate_limited', {
        'Retry-After': String(rateLimit.retryAfterSec ?? 60),
      });
    }

    // 3. Lookup Workspace
    const supabase = createClient(supabaseUrl, supabaseServiceKey) as any;
    const workspaceLookup = await supabase
      .from('workspaces')
      .select('id, name, provider, store_raw_body, raw_body_retention_days, encrypted_secret, plan, subscription_status, subscription_current_period_end')
      .eq('api_key_hash', keyHash)
      .single();
    let workspace = workspaceLookup.data;

    if (workspaceLookup.error || !workspace) {
      const graceCutoff = new Date(Date.now() - KEY_ROTATION_GRACE_MS).toISOString();
      const { data: rotation } = await supabase
        .from('api_key_rotations')
        .select('workspace_id, rotated_at')
        .eq('old_key_hash_hint', keyHash)
        .gte('rotated_at', graceCutoff)
        .order('rotated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rotation?.workspace_id) {
        const { data: fallbackWorkspace } = await supabase
          .from('workspaces')
          .select('id, name, provider, store_raw_body, raw_body_retention_days, encrypted_secret, plan, subscription_status, subscription_current_period_end')
          .eq('id', rotation.workspace_id)
          .single();
        workspace = fallbackWorkspace || null;
      }
    }

    if (!workspace) {
      return errorResponse('Invalid API key', 401, 'invalid_api_key');
    }

    // 3.5. Enforce Monthly Limits (Plan Quota)
    const now = new Date();
    const startOfMonth = getMonthKey(now);

    const { data: usageData, error: usageError } = await supabase
      .from('workspace_ingest_counters')
      .select('event_count')
      .eq('workspace_id', workspace.id)
      .eq('month', startOfMonth)
      .maybeSingle();

    const usageCount = usageData?.event_count || 0;

    if (!usageError || usageError.code === 'PGRST116') {
      const plan = (workspace.plan || 'free') as PlanTier;
      const limits = getPlanLimits(plan);
      const limit = limits.monthlyIngestEvents;

      if (usageCount >= limit) {
        return errorResponse(
          `Monthly limit exceeded for ${plan} plan (${limit} certificates). Upgrade to accept more.`,
          429,
          'quota_exceeded'
        );
      }
    }

    const { meta: batchMeta, error: batchError } = parseBatchMetadata(req.headers);
    if (batchError) {
      return errorResponse(batchError, 400, 'invalid_batch_metadata');
    }
    if (batchMeta) {
      const batchUpsertError = await ensureBatchRow(supabase, workspace.id, batchMeta);
      if (batchUpsertError) {
        return errorResponse(batchUpsertError, 500, 'batch_metadata_failed');
      }
    }

    // 4. Process Payload
    let rawBody = '';
    const maxBytes = getMaxIngestBytes();
    const contentLength = req.headers.get('content-length');
    if (contentLength) {
      const parsedLength = Number(contentLength);
      if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
        return errorResponse(
          `Payload too large. Max ${maxBytes} bytes.`,
          413,
          'payload_too_large'
        );
      }
    }
    try {
      const buffer = await req.arrayBuffer();
      if (buffer.byteLength > maxBytes) {
        return errorResponse(
          `Payload too large. Max ${maxBytes} bytes.`,
          413,
          'payload_too_large'
        );
      }
      rawBody = new TextDecoder('utf-8').decode(buffer);
    } catch {
      return errorResponse('Unable to read body', 400, 'invalid_body');
    }

    const parsedPayload = tryParseJson(rawBody);
    const canonicalJsonSha256 = parsedPayload ? computeCanonicalJsonSha256(parsedPayload) : undefined;
    const rawBodySha256 = computeRawBodySha256(rawBody);
    const reqHeaders = new Headers(req.headers);
    const sanitizedHeaders = sanitizeHeaders(reqHeaders);
    const detectedProvider = detectProvider(sanitizedHeaders);
    const extractedEventId = extractEventId(detectedProvider, rawBody);

    // 5. Signature Verification (BYOS or Stored)
    let secret = reqHeaders.get('x-lanceiq-secret');
    if (!secret && workspace.encrypted_secret) {
      try {
        secret = decrypt(workspace.encrypted_secret);
      } catch (err) {
        console.error('Workspace secret decryption failed', err);
      }
    }

    const redis = getRedisClient();
    const dedupKey = extractedEventId
      ? `dedup:${workspace.id}:${detectedProvider}:${extractedEventId}`
      : `dedup:${workspace.id}:hash:${rawBodySha256}`;
    const dedupTtl = extractedEventId ? DEDUP_EVENT_TTL_SEC : DEDUP_HASH_TTL_SEC;
    const isDuplicate = await markAndCheckDuplicate(redis, dedupKey, dedupTtl);

    let verificationResult: VerificationResult = {
      status: 'not_verified',
      reason: isDuplicate ? 'duplicate' : 'missing_secret',
      providerEventId: extractedEventId ?? undefined,
    };

    let verifiedProvider: Provider = detectedProvider;
    if (secret && !isDuplicate) {
      const configuredProvider = workspace.provider as string | null | undefined;
      const providerToVerify: Provider =
        configuredProvider === 'stripe' || configuredProvider === 'razorpay' || configuredProvider === 'lemon_squeezy'
          ? configuredProvider
          : detectProvider(sanitizedHeaders);

      verifiedProvider = providerToVerify;
      verificationResult = verifySignature(providerToVerify, rawBody, sanitizedHeaders, secret);
    }

    // 6. Store Event
    const expiresAt = workspace.store_raw_body
      ? new Date(Date.now() + (workspace.raw_body_retention_days || 7) * 24 * 60 * 60 * 1000)
      : null;

    const providerEventId = verificationResult.providerEventId || extractedEventId;

    const insertPayload: Record<string, any> = {
      workspace_id: workspace.id,
      payload: parsedPayload,
      headers: sanitizedHeaders,
      raw_body_sha256: rawBodySha256,
      canonical_json_sha256: canonicalJsonSha256 ?? null,
      raw_body: workspace.store_raw_body ? rawBody : null,
      raw_body_expires_at: expiresAt ? expiresAt.toISOString() : null,
      detected_provider: detectedProvider,
      signature_status: verificationResult.status,
      signature_reason: verificationResult.reason,
      provider_event_id: providerEventId,
      is_duplicate: isDuplicate,
    };

    if (batchMeta) {
      insertPayload.batch_id = batchMeta.id;
      if (typeof batchMeta.size === 'number') insertPayload.batch_size = batchMeta.size;
      if (batchMeta.status) insertPayload.batch_status = batchMeta.status;
      if (batchMeta.receivedAt) insertPayload.batch_received_at = batchMeta.receivedAt;
    }

    const { data: event, error: insertError } = await supabase
      .from('ingested_events')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === '23505' && providerEventId) {
        const { data: existing, error: existingError } = await supabase
          .from('ingested_events')
          .select('id')
          .eq('workspace_id', workspace.id)
          .eq('provider_event_id', providerEventId)
          .order('received_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingError && existing?.id) {
          return NextResponse.json(
            { status: 'duplicate', id: existing.id, verified: 'not_verified' },
            { status: 200 }
          );
        }
      }

      console.error('Ingest Insert Error:', insertError);
      return errorResponse('Storage failed', 500, 'storage_failed');
    }

    if (batchMeta) {
      await updateBatchProgress(supabase, batchMeta.id);
    }

    void anchorIngestedEvent({
      workspaceId: workspace.id,
      ingestedEventId: event.id,
      rawBodySha256,
    });

    // 7. Log to Verification History
    const { error: historyError } = await supabase.from('verification_history').insert({
      ingested_event_id: event.id,
      triggered_by: 'ingest',
      provider: workspace.provider,
      signature_status: verificationResult.status,
      signature_reason: verificationResult.reason,
      raw_body_sha256: rawBodySha256,
      verified_at: new Date().toISOString(),
    });

    if (historyError) {
      console.error('History Log Error:', historyError);
    }

    const canAlert = canSendAlerts(workspace);

    // 8. Smart Alerts (critical only, deduped + cooldown)
    if (
      canAlert &&
      !isDuplicate &&
      verificationResult.status === 'failed' &&
      isCriticalReason(verificationResult.reason)
    ) {
      const { data: alertSettings } = await supabase
        .from('workspace_alert_settings')
        .select('id, workspace_id, channel, destination, enabled, critical_fail_count, window_minutes, cooldown_minutes')
        .eq('workspace_id', workspace.id)
        .eq('enabled', true);

      if (alertSettings && alertSettings.length) {
        await Promise.all(
          (alertSettings as AlertSetting[]).map((setting) =>
            maybeSendCriticalAlert({
              redis,
              setting,
              workspaceName: workspace.name ?? 'Workspace',
              provider: verifiedProvider,
              reason: verificationResult.reason || 'mismatch',
              eventId: event.id,
            })
          )
        );
      }
    }

    await maybeEnqueueForwardingJobs({
      supabase,
      workspace,
      eventId: event.id,
      rawBody,
      sourceHeaders: sanitizedHeaders,
      sourceContentType: req.headers.get('content-type') || 'application/json',
      detectedProvider: verifiedProvider,
      providerEventId: providerEventId ?? null,
    });

    const statusText = isDuplicate ? 'duplicate' : 'queued';
    const httpStatus = isDuplicate ? 200 : 202;
    return NextResponse.json(
      { status: statusText, id: event.id, verified: verificationResult.status },
      { status: httpStatus }
    );
  } catch (globalErr: unknown) {
    console.error('Unhandled API Error:', globalErr);
    return errorResponse('Internal Server Error', 500, 'internal_error');
  }
}

export function errorResponse(message: string, status: number, code: string, headers?: HeadersInit) {
  return NextResponse.json(
    { status: 'error', id: null, error: message, error_code: code },
    { status, headers }
  );
}

function canSendAlerts(workspace: { plan?: string | null; subscription_status?: string | null; subscription_current_period_end?: string | null }) {
  return getEffectiveEntitlementsForWorkspace(workspace).canUseAlerts;
}

async function maybeEnqueueForwardingJobs(params: {
  supabase: any;
  workspace: {
    id: string;
    plan?: string | null;
    subscription_status?: string | null;
    subscription_current_period_end?: string | null;
  };
  eventId: string;
  rawBody: string;
  sourceHeaders: Record<string, string>;
  sourceContentType: string;
  detectedProvider: string;
  providerEventId: string | null;
}) {
  const entitlements = getEffectiveEntitlementsForWorkspace(params.workspace);
  const canUseForwarding = Boolean((entitlements as any).canUseForwarding);
  if (!canUseForwarding) return;

  const { targets, error: targetError } = await listActiveDeliveryTargets(
    params.supabase,
    params.workspace.id
  );
  if (targetError) {
    await writeIngestAuditFailure(params.supabase, params.workspace.id, {
      event_id: params.eventId,
      reason: targetError,
      stage: 'targets_fetch',
    });
    return;
  }

  if (!targets.length) return;

  const eventType = `lanceiq.ingest.${params.detectedProvider || 'generic'}`;
  for (const target of targets) {
    const idempotencyKey = [
      'ingest',
      params.eventId,
      target.id,
      params.providerEventId || 'none',
    ].join(':');

    const forwardingPayload = buildForwardingEnvelopeV1({
      rawBody: params.rawBody,
      sourceHeaders: params.sourceHeaders,
      sourceContentType: params.sourceContentType || 'application/json',
      metadata: {
        ingested_event_id: params.eventId,
        detected_provider: params.detectedProvider,
        provider_event_id: params.providerEventId,
      },
    });

    const result = await enqueueDeliveryJob({
      admin: params.supabase,
      workspaceId: params.workspace.id,
      targetId: target.id,
      eventType,
      payload: forwardingPayload,
      triggerSource: 'ingest',
      idempotencyKey,
      ingestedEventId: params.eventId,
      createdBy: null,
      priority: 5,
    });

    if (result.error) {
      await writeIngestAuditFailure(params.supabase, params.workspace.id, {
        event_id: params.eventId,
        target_id: target.id,
        reason: result.error,
        stage: 'enqueue_delivery_job',
      });
    }
  }
}

async function writeIngestAuditFailure(
  supabase: any,
  workspaceId: string,
  details: Record<string, unknown>
) {
  await supabase.from('audit_logs').insert({
    workspace_id: workspaceId,
    actor_id: null,
    action: 'delivery.enqueue_failed',
    target_resource: 'delivery_jobs',
    details,
  });
}

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const deny = new Set([
    'x-lanceiq-secret',
    'x-lanceiq-api-key',
    'x-api-key',
    'authorization',
    'cookie',
    'set-cookie',
  ]);
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!deny.has(key.toLowerCase())) {
      obj[key] = value;
    }
  });
  return obj;
}

function getMaxIngestBytes() {
  const raw = process.env.INGEST_MAX_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_INGEST_BYTES;
}

function getMonthKey(date: Date) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return first.toISOString().slice(0, 10);
}

type BatchMeta = {
  id: string;
  size?: number;
  status?: string;
  receivedAt?: string;
};

function parseBatchMetadata(headers: Headers): { meta: BatchMeta | null; error?: string } {
  const batchId = headers.get('x-lanceiq-batch-id')?.trim() || '';
  const batchSizeRaw = headers.get('x-lanceiq-batch-size')?.trim() || '';
  const batchStatusRaw = headers.get('x-lanceiq-batch-status')?.trim() || '';
  const batchReceivedRaw = headers.get('x-lanceiq-batch-received-at')?.trim() || '';

  const hasAny = Boolean(batchId || batchSizeRaw || batchStatusRaw || batchReceivedRaw);
  if (!hasAny) return { meta: null };

  if (!batchId) return { meta: null, error: 'batch_id required when batch metadata is provided' };
  if (!isValidUuid(batchId)) return { meta: null, error: 'Invalid batch_id' };

  const meta: BatchMeta = { id: batchId };

  if (batchSizeRaw) {
    const parsed = Number(batchSizeRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { meta: null, error: 'Invalid batch_size' };
    }
    meta.size = Math.floor(parsed);
  }

  if (batchStatusRaw) {
    const normalized = batchStatusRaw.toLowerCase();
    if (!VALID_BATCH_STATUSES.has(normalized)) {
      return { meta: null, error: 'Invalid batch_status' };
    }
    meta.status = normalized;
  }

  if (batchReceivedRaw) {
    const parsedDate = new Date(batchReceivedRaw);
    if (Number.isNaN(parsedDate.getTime())) {
      return { meta: null, error: 'Invalid batch_received_at' };
    }
    meta.receivedAt = parsedDate.toISOString();
  }

  return { meta };
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensureBatchRow(
  supabase: any,
  workspaceId: string,
  meta: BatchMeta
): Promise<string | null> {
  const { data: existing, error: existingError } = await supabase
    .from('ingest_batches')
    .select('id, workspace_id')
    .eq('id', meta.id)
    .maybeSingle();

  if (existingError) {
    console.error('Batch lookup failed:', existingError);
    return 'Failed to validate batch';
  }

  if (existing?.workspace_id && existing.workspace_id !== workspaceId) {
    return 'Batch does not belong to workspace';
  }

  if (!existing?.id) {
    const payload: Record<string, any> = {
      id: meta.id,
      workspace_id: workspaceId,
    };
    if (meta.status) payload.status = meta.status;
    if (typeof meta.size === 'number') payload.total_events = meta.size;

    const { error } = await supabase.from('ingest_batches').insert(payload);
    if (error) {
      console.error('Batch insert failed:', error);
      return 'Failed to create batch';
    }
    return null;
  }

  if (meta.status || typeof meta.size === 'number') {
    const payload: Record<string, any> = {};
    if (meta.status) payload.status = meta.status;
    if (typeof meta.size === 'number') payload.total_events = meta.size;
    const { error } = await supabase
      .from('ingest_batches')
      .update(payload)
      .eq('id', meta.id);
    if (error) {
      console.error('Batch update failed:', error);
      return 'Failed to update batch';
    }
  }

  return null;
}

async function updateBatchProgress(
  supabase: any,
  batchId: string
) {
  const { count: processedCount, error: processedError } = await supabase
    .from('ingested_events')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId);

  if (processedError || processedCount === null) {
    console.error('Batch progress count failed:', processedError);
    return;
  }

  const { count: failedCount, error: failedError } = await supabase
    .from('ingested_events')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('signature_status', 'failed');

  if (failedError || failedCount === null) {
    console.error('Batch failed count failed:', failedError);
  }

  const payload: Record<string, any> = { processed_events: processedCount };
  if (failedCount !== null) payload.failed_events = failedCount;

  const { error: updateError } = await supabase
    .from('ingest_batches')
    .update(payload)
    .eq('id', batchId);

  if (updateError) {
    console.error('Batch progress update failed:', updateError);
  }
}

// Pure helpers exposed for unit tests.
export const ingestCoreTestUtils = {
  canSendAlerts,
  tryParseJson,
  sanitizeHeaders,
  getMaxIngestBytes,
  getMonthKey,
  parseBatchMetadata,
  isValidUuid,
};
