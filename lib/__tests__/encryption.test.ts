import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../encryption';

describe('encryption', () => {
  const originalKey = process.env.ENCRYPTION_MASTER_KEY;
  const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = validKey;
  });

  afterEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = originalKey;
  });

  it('encrypts and decrypts roundtrip', () => {
    const plain = 'super-secret-webhook-key';
    const encrypted = encrypt(plain);
    const decrypted = decrypt(encrypted);

    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(decrypted).toBe(plain);
  });

  it('throws when key is missing', () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(() => encrypt('x')).toThrow(/ENCRYPTION_MASTER_KEY is missing/);
  });

  it('throws when key is wrong length', () => {
    process.env.ENCRYPTION_MASTER_KEY = 'abc';
    expect(() => encrypt('x')).toThrow(/must be a 32-byte hex string/);
  });

  it('throws for invalid encrypted format', () => {
    expect(() => decrypt('not-valid')).toThrow(/Invalid encrypted text format/);
  });
});
