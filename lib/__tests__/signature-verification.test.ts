import { describe, it, expect } from 'vitest';
import { detectProvider, extractEventId, computeRawBodySha256 } from '../signature-verification';

describe('detectProvider', () => {
  it('detects stripe from stripe-signature header', () => {
    expect(detectProvider({ 'stripe-signature': 'abc' })).toBe('stripe');
    expect(detectProvider({ 'Stripe-Signature': 'abc' })).toBe('stripe'); // case insensitive
  });

  it('detects razorpay from x-razorpay-signature header', () => {
    expect(detectProvider({ 'x-razorpay-signature': 'abc' })).toBe('razorpay');
  });

  it('detects lemon_squeezy from x-signature and x-event-name', () => {
    expect(detectProvider({ 'x-signature': 'abc', 'x-event-name': 'order_created' })).toBe('lemon_squeezy');
  });

  it('detects paypal from paypal-related headers', () => {
    expect(detectProvider({ 'paypal-auth-algo': 'SHA256withRSA' })).toBe('paypal');
  });

  it('returns unknown for unrecognized headers', () => {
    expect(detectProvider({ 'content-type': 'application/json' })).toBe('unknown');
  });
});

describe('computeRawBodySha256', () => {
  it('computes correct sha256 hex string', () => {
    // echo -n "" | shasum -a 256
    expect(computeRawBodySha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // echo -n "hello" | shasum -a 256
    expect(computeRawBodySha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('extractEventId', () => {
  it('extracts stripe event id', () => {
    const body = JSON.stringify({ id: 'evt_123', object: 'event' });
    expect(extractEventId('stripe', body)).toBe('evt_123');
  });

  it('extracts razorpay entity id from payload', () => {
    const body = JSON.stringify({
      payload: {
        payment: {
          entity: { id: 'pay_123' }
        }
      }
    });
    expect(extractEventId('razorpay', body)).toBe('pay_123');
  });

  it('extracts lemon_squeezy data id', () => {
    const body = JSON.stringify({
      data: { id: '123', type: 'orders' }
    });
    expect(extractEventId('lemon_squeezy', body)).toBe('123');
  });

  it('returns null for invalid json', () => {
    expect(extractEventId('stripe', 'invalid json')).toBeNull();
  });

  it('returns null if id is missing', () => {
    expect(extractEventId('stripe', '{}')).toBeNull();
  });
});
