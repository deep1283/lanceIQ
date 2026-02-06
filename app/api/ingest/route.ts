import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashApiKey } from '@/lib/api-key';
import { verifySignature, type Provider, detectProvider, computeRawBodySha256, type VerificationResult, extractEventId } from '@/lib/signature-verification';
import { decrypt } from '@/lib/encryption';
import { checkRateLimit, getRedisClient, markAndCheckDuplicate } from '@/lib/ingest-helpers';
import { isCriticalReason, maybeSendCriticalAlert, type AlertSetting } from '@/lib/alerting';

// Header-based ingestion endpoint.
// Use this for environments where putting secrets in the URL path is undesirable.
// Note: Most webhook providers (Stripe/Razorpay) cannot send custom auth headers, so
// `/api/ingest/[apiKey]` remains the primary provider-facing endpoint.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEDUP_EVENT_TTL_SEC = 24 * 60 * 60; // 24h
const DEDUP_HASH_TTL_SEC = 6 * 60 * 60; // 6h

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKeyFromHeaders(req);
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    if (!process.env.API_KEY_HASH_SECRET) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 1. Hash Request Key
    let keyHash: string;
    try {
      keyHash = hashApiKey(apiKey);
    } catch (err: unknown) {
      console.error('API Key Hashing Error:', err);
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 2. Rate Limiting (Per Key)
    const rateLimit = await checkRateLimit(`ingest:${keyHash}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec ?? 60) } }
      );
    }

    // 3. Lookup Workspace
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, provider, store_raw_body, raw_body_retention_days, encrypted_secret, plan, subscription_status, subscription_current_period_end')
      .eq('api_key_hash', keyHash)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
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
          return NextResponse.json(
            { error: `Monthly limit exceeded for ${plan} plan (${limit} certificates). Upgrade to accept more.` },
            { status: 429 } // Too Many Requests
          );
       }
    }

    // 4. Process Payload
    let rawBody = '';
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json({ error: 'Unable to read body' }, { status: 400 });
    }

    const rawBodySha256 = computeRawBodySha256(rawBody);
    const reqHeaders = new Headers(req.headers);
    const sanitizedHeaders = sanitizeHeaders(reqHeaders);
    const detectedProvider = detectProvider(sanitizedHeaders);
    const extractedEventId = extractEventId(detectedProvider, rawBody);

    // 5. Signature Verification (BYOS or Stored)
    let secret = reqHeaders.get('x-lanceiq-secret'); // optional
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
        is_duplicate: isDuplicate,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Ingest Insert Error:', insertError);
      return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
    }

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

    return NextResponse.json({ status: 'stored', verified: verificationResult.status }, { status: 200 });
  } catch (globalErr: unknown) {
    console.error('Unhandled API Error:', globalErr);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

function getApiKeyFromHeaders(req: NextRequest): string | null {
  const headerKey = req.headers.get('x-lanceiq-api-key') || req.headers.get('x-api-key');
  if (headerKey) return headerKey;

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
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
