import { describe, it, expect } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

describe('rateLimit token cardinality cap', () => {
  it('enforces uniqueTokenPerInterval cap by evicting oldest tokens', async () => {
    const limiter = rateLimit({
      interval: 60_000,
      uniqueTokenPerInterval: 2,
    });

    await expect(limiter.check(1, 'token-a')).resolves.toBeUndefined();
    await expect(limiter.check(1, 'token-b')).resolves.toBeUndefined();
    await expect(limiter.check(1, 'token-c')).resolves.toBeUndefined();

    // token-a should have been evicted when token-c was inserted.
    await expect(limiter.check(1, 'token-a')).resolves.toBeUndefined();
  });
});
