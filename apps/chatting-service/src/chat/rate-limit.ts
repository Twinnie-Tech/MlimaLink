import type Redis from 'ioredis';
import { getRedis } from '../redis';

const WINDOW_MS = 60_000;

/** Counts actions per person in fixed one-minute windows. */
export interface RateLimiter {
  /** Records one action; false when the person is over the limit for this window. */
  take(key: string): Promise<boolean>;
}

/** Counts on this instance only: used without Redis, or while Redis is unreachable. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private nextSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs = WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async take(key: string): Promise<boolean> {
    const now = this.now();
    if (now >= this.nextSweep) {
      for (const [entry, window] of this.windows) {
        if (window.resetAt <= now) this.windows.delete(entry);
      }
      this.nextSweep = now + this.windowMs;
    }

    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window.count <= this.limit;
  }
}

/** Counts in Redis, so the limit holds however many chat instances someone's requests reach. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Pick<Redis, 'multi'>,
    private readonly prefix: string,
    private readonly limit: number,
    private readonly fallback: RateLimiter,
    private readonly windowMs = WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async take(key: string): Promise<boolean> {
    const bucket = Math.floor(this.now() / this.windowMs);
    const redisKey = `${this.prefix}:${key}:${bucket}`;
    try {
      const results = await this.redis
        .multi()
        .incr(redisKey)
        .pexpire(redisKey, this.windowMs)
        .exec();
      const [error, count] = results?.[0] ?? [new Error('No reply')];
      if (error) throw error;
      return Number(count) <= this.limit;
    } catch {
      return this.fallback.take(key);
    }
  }
}

function limitFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function createLimiter(prefix: string, limit: number): RateLimiter {
  const memory = new MemoryRateLimiter(limit);
  const redis = getRedis();
  return redis ? new RedisRateLimiter(redis, prefix, limit, memory) : memory;
}

let messages: RateLimiter | undefined;
let uploads: RateLimiter | undefined;

/** Messages per person per minute: CHAT_RATE_LIMIT_PER_MINUTE, 30 by default. */
export const messageLimiter = (): RateLimiter =>
  (messages ??= createLimiter(
    'chat:send',
    limitFromEnv('CHAT_RATE_LIMIT_PER_MINUTE', 30),
  ));

/** Photo uploads per person per minute: CHAT_UPLOAD_LIMIT_PER_MINUTE, 10 by default. */
export const uploadLimiter = (): RateLimiter =>
  (uploads ??= createLimiter(
    'chat:upload',
    limitFromEnv('CHAT_UPLOAD_LIMIT_PER_MINUTE', 10),
  ));
