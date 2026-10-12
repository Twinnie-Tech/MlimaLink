import {
  MemoryPresenceStore,
  PRESENCE_TTL_MS,
  RedisPresenceStore,
  effectiveStatus,
  isActiveStatus,
  isManualStatus,
} from './presence';

vi.mock('../redis', () => ({ getRedis: () => null }));

const key = 'user:' + 'a'.repeat(24);
const iso = (ms: number) => new Date(ms).toISOString();

describe('isActiveStatus', () => {
  it('accepts what a client may set', () => {
    expect(isActiveStatus('available')).toBe(true);
    expect(isActiveStatus('away')).toBe(true);
    expect(isActiveStatus('offline')).toBe(false);
    expect(isActiveStatus('busy')).toBe(false);
  });
});

describe('manual statuses', () => {
  it('accepts what an admin may set, and it wins over what their tabs report', () => {
    for (const status of ['busy', 'dnd', 'brb', 'away', 'offline']) {
      expect(isManualStatus(status)).toBe(true);
    }
    expect(isManualStatus('available')).toBe(false);
    expect(isManualStatus(null)).toBe(false);
    expect(effectiveStatus('available', 'busy')).toBe('busy');
    expect(effectiveStatus('away', null)).toBe('away');
  });

  it('are kept in memory without Redis, and appearing offline hides last seen', async () => {
    const store = new MemoryPresenceStore(() => 1_000_000);
    await store.touch([{ key, status: 'away' }]);

    await store.setManual(key, 'busy');
    expect((await store.get([key])).get(key)?.status).toBe('busy');
    await store.setManual(key, 'offline');
    expect((await store.get([key])).get(key)).toEqual({
      status: 'offline',
      lastSeenAt: null,
    });
    await store.setManual(key, null);
    expect(await store.getManual(key)).toBeNull();
    expect((await store.get([key])).get(key)?.status).toBe('away');
  });
});

describe('MemoryPresenceStore', () => {
  it('tracks status and last seen, and expires stale entries', async () => {
    let now = 1_000_000;
    const store = new MemoryPresenceStore(() => now);

    expect((await store.get([key])).get(key)).toEqual({
      status: 'offline',
      lastSeenAt: null,
    });

    await store.touch([{ key, status: 'away' }]);
    expect((await store.get([key])).get(key)).toEqual({
      status: 'away',
      lastSeenAt: iso(1_000_000),
    });

    now += PRESENCE_TTL_MS;
    expect((await store.get([key])).get(key)?.status).toBe('offline');

    await store.leave(key);
    expect((await store.get([key])).get(key)).toEqual({
      status: 'offline',
      lastSeenAt: iso(now),
    });
  });
});

describe('RedisPresenceStore', () => {
  const now = 2_000_000;

  function fakeRedis() {
    const hashes = new Map<string, Map<string, string>>();
    const hashOf = (name: string) => {
      if (!hashes.has(name)) hashes.set(name, new Map());
      return hashes.get(name) as Map<string, string>;
    };
    return {
      hash: hashOf('chat:presence'),
      manual: hashOf('chat:presence-manual'),
      redis: {
        hset: vi.fn(async (name: string, ...args: unknown[]) => {
          const entries =
            typeof args[0] === 'object'
              ? Object.entries(args[0] as Record<string, string>)
              : [[args[0] as string, args[1] as string]];
          for (const [field, value] of entries) hashOf(name).set(field, value);
          return entries.length;
        }),
        hmget: vi.fn(async (name: string, ...fields: string[]) =>
          fields.map((field) => hashOf(name).get(field) ?? null),
        ),
        hget: vi.fn(
          async (name: string, field: string) =>
            hashOf(name).get(field) ?? null,
        ),
        hdel: vi.fn(async (name: string, field: string) =>
          Number(hashOf(name).delete(field)),
        ),
      },
    };
  }

  it('keeps admins’ manual statuses in their own hash until they clear them', async () => {
    const { redis, manual } = fakeRedis();
    const store = new RedisPresenceStore(
      redis as never,
      new MemoryPresenceStore(() => now),
      () => now,
    );
    await store.touch([{ key, status: 'available' }]);

    await store.setManual(key, 'dnd');
    expect(manual.get(key)).toBe('dnd');
    expect(await store.getManual(key)).toBe('dnd');
    expect((await store.get([key])).get(key)?.status).toBe('dnd');

    await store.setManual(key, 'offline');
    expect((await store.get([key])).get(key)).toEqual({
      status: 'offline',
      lastSeenAt: null,
    });

    await store.setManual(key, null);
    expect(manual.has(key)).toBe(false);
    expect(await store.getManual(key)).toBeNull();
    expect((await store.get([key])).get(key)?.status).toBe('available');
  });

  it('shares presence through one Redis hash', async () => {
    const { redis, hash } = fakeRedis();
    const store = new RedisPresenceStore(
      redis as never,
      new MemoryPresenceStore(() => now),
      () => now,
    );

    await store.touch([{ key, status: 'available' }]);
    expect(hash.get(key)).toBe(`available:${now}`);
    expect((await store.get([key, 'seller:x'])).get(key)).toEqual({
      status: 'available',
      lastSeenAt: iso(now),
    });

    await store.leave(key);
    expect(hash.get(key)).toBe(`offline:${now}`);
  });

  it('treats unreadable values as never seen', async () => {
    const { redis, hash } = fakeRedis();
    hash.set(key, 'nonsense');
    const store = new RedisPresenceStore(
      redis as never,
      new MemoryPresenceStore(() => now),
      () => now,
    );

    expect((await store.get([key])).get(key)).toEqual({
      status: 'offline',
      lastSeenAt: null,
    });
  });

  it('falls back to this instance’s view when Redis fails', async () => {
    const down = () => vi.fn().mockRejectedValue(new Error('down'));
    const redis = { hset: down(), hmget: down(), hget: down(), hdel: down() };
    const store = new RedisPresenceStore(
      redis as never,
      new MemoryPresenceStore(() => now),
      () => now,
    );

    await store.touch([{ key, status: 'available' }]);
    expect((await store.get([key])).get(key)?.status).toBe('available');

    await store.setManual(key, 'brb');
    expect(await store.getManual(key)).toBe('brb');
    expect((await store.get([key])).get(key)?.status).toBe('brb');
  });
});
