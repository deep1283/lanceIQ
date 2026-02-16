import { describe, expect, it } from 'vitest';
import {
  buildForwardingEnvelopeV1,
  decodeForwardingEnvelopeBody,
  pickForwardableSourceHeaders,
} from '@/lib/delivery/payload';
import { deliveryServiceTestUtils } from '@/lib/delivery/service';

describe('delivery forwarding payload envelope', () => {
  it('allowlists source headers for forwarding', () => {
    const out = pickForwardableSourceHeaders({
      'Content-Type': 'application/json',
      'stripe-signature': 'sig_123',
      authorization: 'Bearer secret',
      'x-api-key': 'key',
      'x-request-id': 'req_1',
    });

    expect(out['content-type']).toBe('application/json');
    expect(out['stripe-signature']).toBe('sig_123');
    expect(out['x-request-id']).toBe('req_1');
    expect(out.authorization).toBeUndefined();
    expect(out['x-api-key']).toBeUndefined();
  });

  it('preserves immutable raw body bytes for forwarding send', () => {
    const rawBody = '{"order":123,"status":"paid"}\n';
    const envelope = buildForwardingEnvelopeV1({
      rawBody,
      sourceContentType: 'application/json',
      sourceHeaders: { 'content-type': 'application/json', 'stripe-signature': 'sig_123' },
      metadata: { ingested_event_id: 'evt_local_1' },
    });

    const decoded = decodeForwardingEnvelopeBody(envelope);
    expect(decoded?.toString('utf8')).toBe(rawBody);

    const outbound = deliveryServiceTestUtils.buildOutboundPayload(envelope);
    expect(outbound.bodyBytes.toString('utf8')).toBe(rawBody);
    expect(outbound.bodyText).toBe(rawBody);
    expect(outbound.contentType).toBe('application/json');
    expect(outbound.sourceHeaders['stripe-signature']).toBe('sig_123');
  });
});
