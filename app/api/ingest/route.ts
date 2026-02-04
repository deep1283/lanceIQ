import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashApiKey } from '@/lib/api-key';
import { verifySignature, type Provider, detectProvider, computeRawBodySha256, type VerificationResult } from '@/lib/signature-verification';
import { decrypt } from '@/lib/encryption';

// Header-based ingestion endpoint.
// Use this for environments where putting secrets in the URL path is undesirable.
// Note: Most webhook providers (Stripe/Razorpay) cannot send custom auth headers, so
// `/api/ingest/[apiKey]` remains the primary provider-facing endpoint.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Simple in-memory rate limit for MVP (Map<apiHash, { count, windowStart }>)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const LIMIT_MAX_REQUESTS = 60; // 60 reqs/min per key

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
    const now = Date.now();
    const limitState = rateLimitMap.get(keyHash) || { count: 0, windowStart: now };

    if (now - limitState.windowStart > LIMIT_WINDOW_MS) {
      rateLimitMap.set(keyHash, { count: 1, windowStart: now });
    } else {
      if (limitState.count >= LIMIT_MAX_REQUESTS) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': '60' } }
        );
      }
      limitState.count++;
      rateLimitMap.set(keyHash, limitState);
    }

    // 3. Lookup Workspace
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, provider, store_raw_body, raw_body_retention_days, encrypted_secret')
      .eq('api_key_hash', keyHash)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
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

    // 5. Signature Verification (BYOS or Stored)
    let secret = reqHeaders.get('x-lanceiq-secret'); // optional
    if (!secret && workspace.encrypted_secret) {
      try {
        secret = decrypt(workspace.encrypted_secret);
      } catch (err) {
        console.error('Workspace secret decryption failed', err);
      }
    }

    let verificationResult: VerificationResult = {
      status: 'not_verified',
      reason: 'missing_secret',
      providerEventId: undefined,
    };

    const sanitizedHeaders = sanitizeHeaders(reqHeaders);
    if (secret) {
      const configuredProvider = workspace.provider as string | null | undefined;
      const providerToVerify: Provider =
        configuredProvider === 'stripe' || configuredProvider === 'razorpay'
          ? configuredProvider
          : detectProvider(sanitizedHeaders);

      verificationResult = verifySignature(providerToVerify, rawBody, sanitizedHeaders, secret);
    }

    // 6. Store Event
    const expiresAt = workspace.store_raw_body
      ? new Date(Date.now() + (workspace.raw_body_retention_days || 7) * 24 * 60 * 60 * 1000)
      : null;

    const { data: event, error: insertError } = await supabase
      .from('ingested_events')
      .insert({
        workspace_id: workspace.id,
        payload: tryParseJson(rawBody),
        headers: sanitizedHeaders,
        raw_body_sha256: rawBodySha256,
        raw_body: workspace.store_raw_body ? rawBody : null,
        raw_body_expires_at: expiresAt ? expiresAt.toISOString() : null,
        detected_provider: detectProvider(sanitizedHeaders),
        signature_status: verificationResult.status,
        signature_reason: verificationResult.reason,
        provider_event_id: verificationResult.providerEventId,
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

    return NextResponse.json({ status: 'stored', verified: verificationResult.status }, { status: 200 });
  } catch (globalErr: unknown) {
    console.error('Unhandled API Error:', globalErr);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
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

