/**
 * Simple in-memory rate limiter using a Map with time-based reset.
 * Suitable for serverless functions (Phase 1) where exact precision isn't critical.
 */

interface Options {
  interval: number; // milliseconds
  uniqueTokenPerInterval: number; // Max number of unique tokens (IPs) to track
}

export function rateLimit(options: Options) {
  const tokenCache = new Map<string, { timestamps: number[]; lastSeen: number }>();
  let lastCleanup = Date.now();

  return {
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        const now = Date.now();
        
        // Cleanup periodically
        if (now - lastCleanup > options.interval) {
          tokenCache.clear();
          lastCleanup = now;
        }

        const state = tokenCache.get(token);
        const timestamps = state?.timestamps || [];
        // Filter out old timestamps
        const validTimestamps = timestamps.filter(t => now - t < options.interval);

        if (validTimestamps.length >= limit) {
          reject();
        } else {
          // Cap unique token cardinality to avoid unbounded memory growth.
          if (!state && tokenCache.size >= options.uniqueTokenPerInterval) {
            const oldestToken = tokenCache.keys().next().value;
            if (oldestToken) {
              tokenCache.delete(oldestToken);
            }
          }

          validTimestamps.push(now);
          tokenCache.delete(token); // refresh insertion order (LRU-ish eviction)
          tokenCache.set(token, { timestamps: validTimestamps, lastSeen: now });
          resolve();
        }
      }),
  };
}
