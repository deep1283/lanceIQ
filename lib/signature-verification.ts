import crypto from 'crypto';

export type Provider = 'stripe' | 'razorpay' | 'paypal' | 'unknown';

export type StatusReason = 
  | 'missing_header' 
  | 'missing_secret' 
  | 'unsupported_provider' 
  | 'mismatch' 
  | 'malformed_signature' 
  | 'timestamp_expired'
  | 'duplicate';

export interface VerificationResult {
  status: 'verified' | 'failed' | 'not_verified';
  reason?: StatusReason;
  method?: string;
  error?: string;
  secretHint?: string;
  providerEventId?: string;
  toleranceUsedSec?: number;
}

export interface VerificationApiResponse extends VerificationResult {
  provider: Provider;
  verifiedAt: string | null;
  rawBodySha256: string;
  verificationToken?: string;
}

// Environment variable for timestamp tolerance (default to 5 minutes)
const STRIPE_TIMESTAMP_TOLERANCE_SEC = parseInt(process.env.STRIPE_TIMESTAMP_TOLERANCE_SEC || '300', 10);

/**
 * Main verification function that delegates to provider-specific logic
 */
export function verifySignature(
  provider: Provider,
  rawBody: string,
  headers: Record<string, string>,
  secret: string
): VerificationResult {
  // Normalize headers to lowercase for reliable lookup
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // Common check: missing secret
  if (!secret || secret.trim() === '') {
    return { 
      status: 'not_verified', 
      reason: 'missing_secret', 
      error: 'Webhook secret is required for verification.' 
    };
  }
  
  const secretHint = secret.length > 4 ? `...${secret.slice(-4)}` : '****';

  switch (provider) {
    case 'stripe':
      return verifyStripeSignature(rawBody, normalizedHeaders, secret, secretHint);
    case 'razorpay':
      return verifyRazorpaySignature(rawBody, normalizedHeaders, secret, secretHint);
    case 'paypal':
      // Phase 1: Not supported (requires server-to-server API calls)
      return { 
        status: 'not_verified', 
        reason: 'unsupported_provider', 
        error: 'PayPal verification requires server-side API credentials (supported in Phase 2).',
        secretHint
      };
    default:
      return { 
        status: 'not_verified', 
        reason: 'unsupported_provider', 
        error: `Provider '${provider}' is not supported for signature verification via secret.`,
        secretHint
      };
  }
}

/**
 * Verify Stripe webhook signature (HMAC-SHA256 with timestamp)
 * Format: Stripe-Signature: t=1234567890,v1=signature_hash
 */
export function verifyStripeSignature(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
  secretHint: string
): VerificationResult {
  const sigHeader = headers['stripe-signature'];
  if (!sigHeader) {
    return { 
      status: 'not_verified', 
      reason: 'missing_header', 
      error: 'Missing Stripe-Signature header.', 
      secretHint 
    };
  }

  // Parse t=... and v1=... (Stripe can send multiple v1 signatures)
  const parts = sigHeader.split(',').map(p => p.trim());
  const timestampPart = parts.find(p => p.startsWith('t='));
  const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));

  if (!timestampPart || signatures.length === 0) {
    return { 
      status: 'failed', 
      reason: 'malformed_signature', 
      error: 'Stripe-Signature header format is invalid.',
      secretHint 
    };
  }

  const timestamp = timestampPart.slice(2);
  const now = Math.floor(Date.now() / 1000);
  
  // Timestamp check (if tolerance > 0)
  if (STRIPE_TIMESTAMP_TOLERANCE_SEC > 0) {
    const eventTime = parseInt(timestamp, 10);
    if (isNaN(eventTime)) {
       return { 
        status: 'failed', 
        reason: 'malformed_signature', 
        error: 'Invalid timestamp in signature.',
        secretHint 
      };
    }
    
    if (now - eventTime > STRIPE_TIMESTAMP_TOLERANCE_SEC) {
      return { 
        status: 'failed', 
        reason: 'timestamp_expired', 
        error: `Timestamp is too old (tolerance: ${STRIPE_TIMESTAMP_TOLERANCE_SEC}s).`,
        secretHint,
        toleranceUsedSec: STRIPE_TIMESTAMP_TOLERANCE_SEC
      };
    }
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Check all v1 provided signatures (rotation support)
  let isMatch = false;
  for (const signature of signatures) {
    if (safeCompare(signature, expectedSignature)) {
      isMatch = true;
      break;
    }
  }

  if (isMatch) {
    // Attempt to extract event ID
    const providerEventId = extractEventId('stripe', rawBody);
    return { 
      status: 'verified', 
      method: 'hmac_sha256_stripe_v1', 
      secretHint,
      providerEventId: providerEventId ?? undefined,
      toleranceUsedSec: STRIPE_TIMESTAMP_TOLERANCE_SEC
    };
  } else {
    return { 
      status: 'failed', 
      reason: 'mismatch', 
      error: 'Signature mismatch. Check that you are using the precise raw payload and correct secret.',
      secretHint,
      method: 'hmac_sha256_stripe_v1'
    };
  }
}

/**
 * Verify Razorpay webhook signature (HMAC-SHA256)
 * Format: X-Razorpay-Signature: signature_hash
 */
export function verifyRazorpaySignature(
  rawBody: string, 
  headers: Record<string, string>, 
  secret: string,
  secretHint: string
): VerificationResult {
  const sigHeader = headers['x-razorpay-signature'];
  if (!sigHeader) {
    return { 
      status: 'not_verified', 
      reason: 'missing_header', 
      error: 'Missing X-Razorpay-Signature header.', 
      secretHint 
    };
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (safeCompare(sigHeader, expectedSignature)) {
    const providerEventId = extractEventId('razorpay', rawBody);
    return { 
      status: 'verified', 
      method: 'hmac_sha256_razorpay', 
      secretHint,
      providerEventId: providerEventId ?? undefined
    };
  } else {
    return { 
      status: 'failed', 
      reason: 'mismatch', 
      error: 'Signature mismatch. Ensure raw payload is exact.',
      secretHint,
      method: 'hmac_sha256_razorpay'
    };
  }
}

/**
 * Timing-safe string comparison to prevent side-channel attacks.
 * Only compares if both inputs are valid hex with equal byte length.
 */
function safeCompare(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }

  // Hex validation (even length + only hex chars)
  const hexRe = /^[0-9a-fA-F]+$/;
  if (a.length % 2 !== 0 || b.length % 2 !== 0) return false;
  if (a.length !== b.length) return false;
  if (!hexRe.test(a) || !hexRe.test(b)) return false;

  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Compute SHA-256 hash of raw bytes (UTF-8)
 */
export function computeRawBodySha256(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

/**
 * Compute SHA-256 hash of a deterministic JSON string.
 *
 * Note: This is not a complete RFC 8785 (JCS) implementation (e.g. number formatting),
 * but it is stable for typical webhook JSON payloads (sorted object keys recursively).
 */
export function computeCanonicalJsonSha256(payload: unknown): string | undefined {
  try {
    const canonicalString = stableStringify(payload);
    if (!canonicalString) return undefined;
    return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
  } catch {
    return undefined;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Detect provider based on headers
 */
export function detectProvider(headers: Record<string, string>): Provider {
  const keys = Object.keys(headers).map(k => k.toLowerCase());
  if (keys.includes('stripe-signature')) return 'stripe';
  if (keys.includes('x-razorpay-signature')) return 'razorpay';
  if (keys.some(k => k.includes('paypal'))) return 'paypal';
  return 'unknown';
}

/**
 * Try to extract provider-specific event ID from payload
 */
export function extractEventId(provider: Provider, rawBody: string): string | null {
  try {
    const json = JSON.parse(rawBody) as unknown;
    
    if (provider === 'stripe') {
      const id = (json as Record<string, unknown>)?.id;
      return typeof id === 'string' ? id : null;
    }
    
    if (provider === 'razorpay') {
      // payment.id, payout.id, etc.
      const payload = (json as Record<string, unknown>)?.payload;
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        // Best-effort: take the first payload entry and look for `.entity.id`
        const first = Object.values(payload as Record<string, unknown>)[0];
        if (first && typeof first === 'object' && !Array.isArray(first)) {
          const entity = (first as Record<string, unknown>)?.entity;
          const entityId =
            entity && typeof entity === 'object' && !Array.isArray(entity)
              ? (entity as Record<string, unknown>)?.id
              : undefined;
          return typeof entityId === 'string' ? entityId : null;
        }
      }
      return null;
    }
    
    return null;
  } catch {
    return null;
  }
}
