import { MemoryRateLimiter, RedisRateLimiter } from './rate-limit';

vi.mock('../redis', () => ({ getRedis: () => null }));

describe('MemoryRateLimiter', () => {
  it('allows up to the limit per person, then resets after the window', async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(2, 1000, () => now);

    expect(await limiter.take('user:a')).toBe(true);
    expect(await limiter.take('user:a')).toBe(true);
    expect(await limiter.take('user:a')).toBe(false);
    expect(await limiter.take('user:b')).toBe(true);

    now = 1000;
    expect(await limiter.take('user:a')).toBe(true);
  });
});

describe('RedisRateLimiter', () => {
  function fakeRedis(exec: () => Promise<unknown>) {
    const chain = {
      incr: vi.fn(() => chain),
      pexpire: vi.fn(() => chain),
      exec: vi.fn(exec),
    };
    return { redis: { multi: () => chain }, chain };
  }

  it('counts in a key per person and window, shared by every instance', async () => {
    let count = 0;
    const { redis, chain } = fakeRedis(async () => [
      [null, ++count],
      [null, 1],
    ]);
    const fallback = { take: vi.fn() };
    const limiter = new RedisRateLimiter(
      redis as never,
      'chat:send',
      2,
      fallback,
      60_000,
      () => 120_000,
    );

    expect(await limiter.take('user:a')).toBe(true);
    expect(await limiter.take('user:a')).toBe(true);
    expect(await limiter.take('user:a')).toBe(false);
    expect(chain.incr).toHaveBeenCalledWith('chat:send:user:a:2');
    expect(chain.pexpire).toHaveBeenCalledWith('chat:send:user:a:2', 60_000);
    expect(fallback.take).not.toHaveBeenCalled();
  });

  it('falls back to counting locally when Redis fails', async () => {
    const { redis } = fakeRedis(async () => {
      throw new Error('Connection is closed.');
    });
    const fallback = { take: vi.fn().mockResolvedValue(false) };
    const limiter = new RedisRateLimiter(redis as never, 'p', 2, fallback);

    expect(await limiter.take('user:a')).toBe(false);
    expect(fallback.take).toHaveBeenCalledWith('user:a');
  });

  it('falls back when a command in the transaction fails', async () => {
    const { redis } = fakeRedis(async () => [[new Error('OOM'), null]]);
    const fallback = { take: vi.fn().mockResolvedValue(true) };
    const limiter = new RedisRateLimiter(redis as never, 'p', 2, fallback);

    expect(await limiter.take('user:a')).toBe(true);
    expect(fallback.take).toHaveBeenCalled();
  });
});
