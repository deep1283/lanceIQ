import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeOutboundUrl,
  createSignedDeliveryHeaders,
  registerDeliveryReplayNonce,
  verifySignedDeliveryRequest,
} from '@/lib/delivery/security';

describe('delivery security controls', () => {
  it('blocks non-https URLs by default', async () => {
    await expect(assertSafeOutboundUrl('http://example.com')).rejects.toThrow(/https/i);
  });

  it('blocks private network literal IP targets', async () => {
    await expect(assertSafeOutboundUrl('https://10.0.0.5/webhook')).rejects.toThrow(/private/i);
  });

  it('generates lanceiq hmac signature headers', () => {
    const signed = createSignedDeliveryHeaders({
      body: '{"ok":true}',
      secret: 'test-secret',
      keyId: 'kid_1',
    });

    expect(signed.headers['x-lanceiq-signature']).toBeTruthy();
    expect(signed.headers['x-lanceiq-signature-alg']).toBe('hmac-sha256');
    expect(signed.headers['x-lanceiq-signature-kid']).toBe('kid_1');
    expect(signed.headers['x-lanceiq-timestamp']).toMatch(/^\d+$/);
    expect(signed.headers['x-lanceiq-nonce']).toHaveLength(36);
  });

  it('supports signing raw Buffer payloads without throwing', () => {
    const signed = createSignedDeliveryHeaders({
      body: Buffer.from('raw-body-bytes', 'utf8'),
      secret: 'test-secret',
    });
    expect(typeof signed.headers['x-lanceiq-signature']).toBe('string');
    expect(signed.headers['x-lanceiq-signature'].length).toBeGreaterThan(10);
  });

  it('returns replay_detected on duplicate nonce insert', async () => {
    const insert = vi.fn(async () => ({ error: { code: '23505' } }));
    const admin = {
      from: vi.fn(() => ({ insert })),
    };

    const now = Math.floor(Date.now() / 1000).toString();
    const result = await registerDeliveryReplayNonce({
      admin,
      workspaceId: '11111111-1111-1111-1111-111111111111',
      targetId: '22222222-2222-2222-2222-222222222222',
      nonce: 'nonce-1',
      timestampSec: now,
    });

    expect(result).toEqual({ ok: false, code: 'replay_detected' });
  });

  it('verifies signed delivery requests', () => {
    const body = '{"event":"payment.succeeded"}';
    const signed = createSignedDeliveryHeaders({
      body,
      secret: 'callback-secret',
    });

    const result = verifySignedDeliveryRequest({
      body,
      secret: 'callback-secret',
      timestampSec: signed.headers['x-lanceiq-timestamp'],
      nonce: signed.headers['x-lanceiq-nonce'],
      signature: signed.headers['x-lanceiq-signature'],
    });

    expect(result).toEqual({ ok: true });
  });

  it('rejects invalid callback signatures', () => {
    const now = Math.floor(Date.now() / 1000).toString();
    const result = verifySignedDeliveryRequest({
      body: '{"event":"payment.succeeded"}',
      secret: 'callback-secret',
      timestampSec: now,
      nonce: 'nonce-123',
      signature: 'deadbeef',
    });

    expect(result).toEqual({ ok: false, code: 'invalid_signature' });
  });
});
