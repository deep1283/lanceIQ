import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis =
  REDIS_URL && REDIS_TOKEN ? Redis.fromEnv() : null;

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 reqs/min per key

const memoryRateLimitMap = new Map<string, { count: number; windowStart: number }>();

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX_REQUESTS, "1 m"),
    })
  : null;

export type RateLimitResult =
  | { allowed: true; retryAfterSec?: number; source: "redis" | "memory" }
  | { allowed: false; retryAfterSec?: number; source: "redis" | "memory" };

export function getRedisClient(): Redis | null {
  return redis;
}

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  if (ratelimit) {
    const res = await ratelimit.limit(key);
    const retryAfterSec = res.reset
      ? Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
      : undefined;
    return { allowed: res.success, retryAfterSec, source: "redis" };
  }

  // Fallback: in-memory per-instance limiter
  const now = Date.now();
  const state = memoryRateLimitMap.get(key) || { count: 0, windowStart: now };

  if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    memoryRateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, source: "memory" };
  }

  if (state.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((state.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    return { allowed: false, retryAfterSec, source: "memory" };
  }

  state.count += 1;
  memoryRateLimitMap.set(key, state);
  return { allowed: true, source: "memory" };
}

export async function markAndCheckDuplicate(
  redisClient: Redis | null,
  key: string,
  ttlSec: number
): Promise<boolean> {
  if (!redisClient) return false;
  const result = await redisClient.set(key, "1", { nx: true, ex: ttlSec });
  return result !== "OK";
}

export async function incrementWindowCounter(
  redisClient: Redis | null,
  key: string,
  windowSec: number
): Promise<number> {
  if (!redisClient) return 0;
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, windowSec);
  }
  return count;
}

export async function acquireCooldown(
  redisClient: Redis | null,
  key: string,
  cooldownSec: number
): Promise<boolean> {
  if (!redisClient) return false;
  const result = await redisClient.set(key, "1", { nx: true, ex: cooldownSec });
  return result === "OK";
}

