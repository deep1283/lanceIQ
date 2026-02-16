import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';

type GuardedFetchOptions = {
  maxRedirects?: number;
  allowHttp?: boolean;
};

const DEFAULT_REPLAY_TTL_SEC = 10 * 60;
const DEFAULT_MAX_CLOCK_SKEW_SEC = 5 * 60;

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.replace('::ffff:', '');
    if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
  }
  return false;
}

function isPrivateAddress(ip: string) {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true;
}

export async function assertSafeOutboundUrl(rawUrl: string, opts?: { allowHttp?: boolean }) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid target URL.');
  }

  const allowHttp = Boolean(opts?.allowHttp || process.env.DELIVERY_ALLOW_HTTP === 'true');
  if (!allowHttp && parsed.protocol !== 'https:') {
    throw new Error('Target URL must use HTTPS.');
  }
  if (allowHttp && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Unsupported target URL protocol.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Target URL must not include credentials.');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new Error('Target URL hostname is required.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Target URL resolves to a private or local network address.');
    }
    return parsed;
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error('Target URL hostname could not be resolved.');
  }

  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error('Target URL resolves to a private or local network address.');
    }
  }

  return parsed;
}

function getRedirectLocation(currentUrl: string, location: string) {
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return null;
  }
}

export async function guardedFetch(
  rawUrl: string,
  init?: RequestInit,
  opts?: GuardedFetchOptions
): Promise<Response> {
  const maxRedirects = opts?.maxRedirects ?? 0;
  const allowHttp = Boolean(opts?.allowHttp);
  let url = rawUrl;

  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const parsed = await assertSafeOutboundUrl(url, { allowHttp });
    const response = await fetch(parsed.toString(), {
      ...init,
      redirect: 'manual',
    });

    const redirectCode = response.status >= 300 && response.status < 400;
    if (!redirectCode) return response;
    if (attempt >= maxRedirects) {
      throw new Error('Target redirect policy blocked request.');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Target returned redirect without location.');
    }

    const nextUrl = getRedirectLocation(parsed.toString(), location);
    if (!nextUrl) {
      throw new Error('Target redirect location is invalid.');
    }
    url = nextUrl;
  }

  throw new Error('Target redirect policy blocked request.');
}

export function createSignedDeliveryHeaders(params: {
  body: string | Buffer;
  secret: string;
  keyId?: string | null;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyBytes = Buffer.isBuffer(params.body) ? params.body : Buffer.from(params.body, 'utf8');
  const prefix = Buffer.from(`${timestamp}.${nonce}.`, 'utf8');
  const signature = crypto
    .createHmac('sha256', params.secret)
    .update(Buffer.concat([prefix, bodyBytes]))
    .digest('hex');

  const headers: Record<string, string> = {
    'x-lanceiq-signature': signature,
    'x-lanceiq-signature-alg': 'hmac-sha256',
    'x-lanceiq-timestamp': timestamp,
    'x-lanceiq-nonce': nonce,
  };

  if (params.keyId) {
    headers['x-lanceiq-signature-kid'] = params.keyId;
  }

  return {
    headers,
    timestamp,
    nonce,
  };
}

function timingSafeHexEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function verifySignedDeliveryRequest(params: {
  body: string | Buffer;
  secret: string;
  timestampSec: string;
  nonce: string;
  signature: string;
}) {
  const parsedTs = Number(params.timestampSec);
  if (!Number.isFinite(parsedTs)) {
    return { ok: false as const, code: 'invalid_timestamp' as const };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parsedTs) > DEFAULT_MAX_CLOCK_SKEW_SEC) {
    return { ok: false as const, code: 'stale_timestamp' as const };
  }

  const bodyBytes = Buffer.isBuffer(params.body) ? params.body : Buffer.from(params.body, 'utf8');
  const prefix = Buffer.from(`${params.timestampSec}.${params.nonce}.`, 'utf8');
  const expected = crypto
    .createHmac('sha256', params.secret)
    .update(Buffer.concat([prefix, bodyBytes]))
    .digest('hex');

  if (!timingSafeHexEqual(params.signature, expected)) {
    return { ok: false as const, code: 'invalid_signature' as const };
  }

  return { ok: true as const };
}

export async function registerDeliveryReplayNonce(params: {
  admin: any;
  workspaceId: string;
  targetId: string;
  nonce: string;
  timestampSec: string;
  ttlSec?: number;
}) {
  const ttlSec = params.ttlSec ?? DEFAULT_REPLAY_TTL_SEC;
  const parsedTs = Number(params.timestampSec);
  if (!Number.isFinite(parsedTs)) {
    return { ok: false as const, code: 'invalid_timestamp' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parsedTs) > DEFAULT_MAX_CLOCK_SKEW_SEC) {
    return { ok: false as const, code: 'stale_timestamp' };
  }

  const requestAt = new Date(parsedTs * 1000);
  const expiresAt = new Date((parsedTs + ttlSec) * 1000);
  const { error } = await params.admin
    .from('delivery_callback_replay_cache')
    .insert({
      workspace_id: params.workspaceId,
      target_id: params.targetId,
      nonce: params.nonce,
      request_ts: requestAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

  if (!error) return { ok: true as const };
  if (error.code === '23505') {
    return { ok: false as const, code: 'replay_detected' };
  }
  return { ok: false as const, code: 'replay_cache_failed' };
}
