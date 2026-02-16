import { afterEach, describe, expect, it } from 'vitest';
import { ingestCoreTestUtils } from '../ingest-core';

describe('ingest-core helpers', () => {
  const originalMax = process.env.INGEST_MAX_BYTES;

  afterEach(() => {
    process.env.INGEST_MAX_BYTES = originalMax;
  });

  it('validates UUID v1-v5 format', () => {
    expect(ingestCoreTestUtils.isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(ingestCoreTestUtils.isValidUuid('------------------------------------')).toBe(false);
    expect(ingestCoreTestUtils.isValidUuid('not-a-uuid')).toBe(false);
  });

  it('sanitizes secret headers', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'x-lanceiq-secret': 'secret',
      authorization: 'Bearer token',
      cookie: 'session=1',
      'stripe-signature': 'sig',
    });

    const out = ingestCoreTestUtils.sanitizeHeaders(headers);
    expect(out['content-type']).toBe('application/json');
    expect(out['stripe-signature']).toBe('sig');
    expect(out.authorization).toBeUndefined();
    expect(out.cookie).toBeUndefined();
    expect(out['x-lanceiq-secret']).toBeUndefined();
  });

  it('parses valid batch metadata', () => {
    const headers = new Headers({
      'x-lanceiq-batch-id': '550e8400-e29b-41d4-a716-446655440000',
      'x-lanceiq-batch-size': '10',
      'x-lanceiq-batch-status': 'PROCESSING',
      'x-lanceiq-batch-received-at': '2026-02-12T10:00:00Z',
    });

    const parsed = ingestCoreTestUtils.parseBatchMetadata(headers);
    expect(parsed.error).toBeUndefined();
    expect(parsed.meta).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      size: 10,
      status: 'processing',
      receivedAt: '2026-02-12T10:00:00.000Z',
    });
  });

  it('rejects invalid batch metadata', () => {
    const headers = new Headers({
      'x-lanceiq-batch-id': 'bad',
      'x-lanceiq-batch-size': '-1',
    });
    const parsed = ingestCoreTestUtils.parseBatchMetadata(headers);
    expect(parsed.meta).toBeNull();
    expect(parsed.error).toBe('Invalid batch_id');
  });

  it('normalizes month key and ingest max bytes', () => {
    expect(ingestCoreTestUtils.getMonthKey(new Date('2026-02-12T16:00:00Z'))).toBe('2026-02-01');

    delete process.env.INGEST_MAX_BYTES;
    expect(ingestCoreTestUtils.getMaxIngestBytes()).toBe(1024 * 1024);

    process.env.INGEST_MAX_BYTES = '2048';
    expect(ingestCoreTestUtils.getMaxIngestBytes()).toBe(2048);
  });

  it('parses JSON safely', () => {
    expect(ingestCoreTestUtils.tryParseJson('{"ok":true}')).toEqual({ ok: true });
    expect(ingestCoreTestUtils.tryParseJson('not json')).toBeNull();
  });

  it('extracts stripe provider_payment_id from payment_intent payload', () => {
    const id = ingestCoreTestUtils.extractProviderPaymentId(
      'stripe',
      {
        id: 'evt_1',
        data: {
          object: {
            object: 'charge',
            payment_intent: 'pi_123',
          },
        },
      },
      {}
    );
    expect(id).toBe('pi_123');
  });

  it('extracts razorpay provider_payment_id from payload entity', () => {
    const id = ingestCoreTestUtils.extractProviderPaymentId(
      'razorpay',
      {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
            },
          },
        },
      },
      {}
    );
    expect(id).toBe('pay_123');
  });

  it('extracts lemon_squeezy provider_payment_id from data.id', () => {
    const id = ingestCoreTestUtils.extractProviderPaymentId(
      'lemon_squeezy',
      {
        data: {
          id: 'order_123',
          type: 'orders',
        },
      },
      {}
    );
    expect(id).toBe('order_123');
  });
});
