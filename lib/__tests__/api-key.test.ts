import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateApiKey, hashApiKey } from '../api-key';

describe('api-key', () => {
  const originalSecret = process.env.API_KEY_HASH_SECRET;

  beforeAll(() => {
    process.env.API_KEY_HASH_SECRET = 'test_secret_123';
  });

  afterAll(() => {
    process.env.API_KEY_HASH_SECRET = originalSecret;
  });

  it('generates key with correct prefix and length', () => {
    const { key, hash, last4 } = generateApiKey();
    // liq_ + 48 hex chars = 52 chars
    expect(key).toMatch(/^liq_[0-9a-f]{48}$/);
    expect(key.length).toBe(52);
    expect(last4).toBe(key.slice(-4));
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // sha256 hex
  });

  it('generates unique keys', () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    expect(k1.key).not.toBe(k2.key);
  });

  it('hashes key deterministically', () => {
    const key = 'test-key';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('throws error if secret is missing', () => {
    delete process.env.API_KEY_HASH_SECRET;
    expect(() => hashApiKey('needs_secret')).toThrow(/Missing API_KEY_HASH_SECRET/);
    process.env.API_KEY_HASH_SECRET = 'test_secret_123';
  });
});
