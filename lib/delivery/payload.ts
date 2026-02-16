const SOURCE_HEADER_ALLOWLIST = new Set([
  'content-type',
  'stripe-signature',
  'x-razorpay-signature',
  'x-signature',
  'x-event-id',
  'x-request-id',
  'x-github-delivery',
  'x-shopify-webhook-id',
  'x-lsq-signature',
]);

export type DeliveryForwardingEnvelopeV1 = {
  _lanceiq_forwarding_v1: true;
  raw_body_base64: string;
  source_content_type: string;
  source_headers: Record<string, string>;
  metadata?: {
    ingested_event_id?: string | null;
    detected_provider?: string | null;
    provider_event_id?: string | null;
  };
};

export function pickForwardableSourceHeaders(headers: Record<string, string> | null | undefined) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalized = key.toLowerCase();
    if (!SOURCE_HEADER_ALLOWLIST.has(normalized)) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    out[normalized] = value;
  }
  return out;
}

export function buildForwardingEnvelopeV1(params: {
  rawBody: string;
  sourceHeaders: Record<string, string>;
  sourceContentType?: string | null;
  metadata?: DeliveryForwardingEnvelopeV1['metadata'];
}): DeliveryForwardingEnvelopeV1 {
  return {
    _lanceiq_forwarding_v1: true,
    raw_body_base64: Buffer.from(params.rawBody, 'utf8').toString('base64'),
    source_content_type: params.sourceContentType || 'application/json',
    source_headers: pickForwardableSourceHeaders(params.sourceHeaders),
    metadata: params.metadata,
  };
}

export function isForwardingEnvelopeV1(value: unknown): value is DeliveryForwardingEnvelopeV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate._lanceiq_forwarding_v1 === true && typeof candidate.raw_body_base64 === 'string';
}

export function decodeForwardingEnvelopeBody(payload: unknown): Buffer | null {
  if (!isForwardingEnvelopeV1(payload)) return null;
  try {
    const decoded = Buffer.from(payload.raw_body_base64, 'base64');
    if (!decoded.length && payload.raw_body_base64.length > 0) return null;
    return decoded;
  } catch {
    return null;
  }
}

export const deliveryPayloadTestUtils = {
  SOURCE_HEADER_ALLOWLIST,
};
