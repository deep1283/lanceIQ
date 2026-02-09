import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashApiKey } from '@/lib/api-key';
import { verifySignature, type Provider, detectProvider, computeRawBodySha256, type VerificationResult, extractEventId } from '@/lib/signature-verification';
import { decrypt } from '@/lib/encryption';
import { checkRateLimit, getRedisClient, markAndCheckDuplicate } from '@/lib/ingest-helpers';
import { isCriticalReason, maybeSendCriticalAlert, type AlertSetting } from '@/lib/alerting';

// Note: Using service role key for ingestion to bypass RLS for inserts
// and to query workspaces by hash.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEDUP_EVENT_TTL_SEC = 24 * 60 * 60; // 24h
const DEDUP_HASH_TTL_SEC = 6 * 60 * 60; // 6h
const DEFAULT_MAX_INGEST_BYTES = 1024 * 1024; // 1 MiB

export async function POST(
  req: NextRequest, 
  { params }: { params: Promise<{ apiKey: string }> }
) {
  try {
    const { apiKey: pathApiKey } = await params;
    
    // Support multiple auth methods:
    // 1. URL path: /api/ingest/[apiKey] (for provider webhooks)
    // 2. Header: Authorization: Bearer <key> (team/direct)
    // 3. Header: X-LanceIQ-Api-Key: <key>
    let apiKey = pathApiKey;
    
    if (!apiKey || apiKey === '_') {
      // Try header auth
      const authHeader = req.headers.get('authorization');
      const apiKeyHeader = req.headers.get('x-lanceiq-api-key');
      const apiKeyHeaderAlt = req.headers.get('x-api-key');
      
      if (authHeader?.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7);
      } else if (apiKeyHeader) {
        apiKey = apiKeyHeader;
      } else if (apiKeyHeaderAlt) {
        apiKey = apiKeyHeaderAlt;
      }
    }
    
    if (!apiKey || apiKey === '_') {
      return errorResponse('Missing API Key', 400, 'missing_api_key');
    }
    
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Note: ensure we select everything needed, including encrypted_secret
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, provider, store_raw_body, raw_body_retention_days, encrypted_secret, plan, subscription_status, subscription_current_period_end')
      .eq('api_key_hash', keyHash)
      .single();

    if (wsError || !workspace) {
      return errorResponse('Invalid API Key', 401, 'invalid_api_key');
    }

    // 3.5. Enforce Monthly Limits (Plan Quota)
    // Avoid heavy COUNT(*) on every request by caching or using estimates if scale is huge.
    // For now, simple count is fine for <10k scale.
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // Check usage
    const { count: usageCount, error: countError } = await supabase
      .from('ingested_events')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id)
      .gte('received_at', startOfMonth);

    if (!countError && usageCount !== null) {
       // Import limits dynamically or fallback
       const limits = {
         free: 100,
         pro: 2000,
         team: 10000 
       };
       // Current plan or default to free
       const plan = (workspace.plan || 'free') as 'free' | 'pro' | 'team';
       const limit = limits[plan] || 100;
       
       if (usageCount >= limit) {
          return errorResponse(
            `Monthly limit exceeded for ${plan} plan (${limit} certificates). Upgrade to accept more.`,
            429,
            'quota_exceeded'
          );
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

    const rawBodySha256 = computeRawBodySha256(rawBody);
    const reqHeaders = new Headers(req.headers);
    const sanitizedHeaders = sanitizeHeaders(reqHeaders);
    const detectedProvider = detectProvider(sanitizedHeaders);
    const extractedEventId = extractEventId(detectedProvider, rawBody);
    
    // 5. Signature Verification (BYOS or Stored)
    let secret = reqHeaders.get('x-lanceiq-secret'); // BYOS has priority
    
    if (!secret && workspace.encrypted_secret) {
      try {
        secret = decrypt(workspace.encrypted_secret);
      } catch (err) {
        console.error('Workspace secret decryption failed', err);
        // Continue with null secret logic (will fail verification)
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
      providerEventId: extractedEventId ?? undefined 
    };

    let verifiedProvider: Provider = detectedProvider;

    if (secret && !isDuplicate) {
      // Verify!
      const configuredProvider = workspace.provider as string | null | undefined;
      const providerToVerify: Provider =
        configuredProvider === 'stripe' || configuredProvider === 'razorpay'
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

    const { data: event, error: insertError } = await supabase
      .from('ingested_events')
      .insert({
        workspace_id: workspace.id,
        payload: tryParseJson(rawBody),
        headers: sanitizedHeaders,
        raw_body_sha256: rawBodySha256,
        raw_body: workspace.store_raw_body ? rawBody : null,
        raw_body_expires_at: expiresAt ? expiresAt.toISOString() : null,
        detected_provider: detectedProvider,
        signature_status: verificationResult.status,
        signature_reason: verificationResult.reason,
        provider_event_id: providerEventId,
        is_duplicate: isDuplicate
      })
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

    // 7. Log to Verification History
    const { error: historyError } = await supabase
      .from('verification_history')
      .insert({
        ingested_event_id: event.id,
        triggered_by: 'ingest',
        provider: workspace.provider,
        signature_status: verificationResult.status,
        signature_reason: verificationResult.reason,
        raw_body_sha256: rawBodySha256,
        verified_at: new Date().toISOString()
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

function canSendAlerts(workspace: { plan?: string | null; subscription_status?: string | null; subscription_current_period_end?: string | null }) {
  const plan = workspace.plan;
  if (plan !== 'team') return false;
  const status = workspace.subscription_status;
  if (status === 'active' || status === 'past_due') return true;
  if (status === 'canceled' && workspace.subscription_current_period_end) {
    return new Date(workspace.subscription_current_period_end).getTime() > Date.now();
  }
  return false;
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

function errorResponse(message: string, status: number, code: string, headers?: HeadersInit) {
  return NextResponse.json(
    { status: 'error', id: null, error: message, error_code: code },
    { status, headers }
  );
}

function getMaxIngestBytes() {
  const raw = process.env.INGEST_MAX_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_INGEST_BYTES;
}
