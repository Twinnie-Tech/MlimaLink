import type Redis from 'ioredis';
import { getRedis } from '../redis';

/**
 * Like Microsoft Teams. Connected people are available or away (idle) automatically;
 * admins can also set busy, do not disturb, be right back, away or appear offline by
 * hand. Anyone not connected is offline.
 */
export type PresenceStatus =
  'available' | 'busy' | 'dnd' | 'brb' | 'away' | 'offline';
/** What a connected tab reports by itself. */
export type ActiveStatus = 'available' | 'away';
/** What an admin can set by hand; "offline" is appear offline. */
export type ManualStatus = 'busy' | 'dnd' | 'brb' | 'away' | 'offline';

export interface Presence {
  status: PresenceStatus;
  /** When they were last connected; null if never, or while appearing offline. ISO date string. */
  lastSeenAt: string | null;
}

/**
 * How long a status lasts without being renewed. Instances renew everyone connected to
 * them every 30 seconds, so a crashed instance's people go offline within this time.
 */
export const PRESENCE_TTL_MS = 75_000;
const REDIS_KEY = 'chat:presence';
/** Kept until the admin changes it, across reconnects. */
const MANUAL_REDIS_KEY = 'chat:presence-manual';

export const isActiveStatus = (value: unknown): value is ActiveStatus =>
  value === 'available' || value === 'away';

const MANUAL_STATUSES = new Set(['busy', 'dnd', 'brb', 'away', 'offline']);
export const isManualStatus = (value: unknown): value is ManualStatus =>
  typeof value === 'string' && MANUAL_STATUSES.has(value);

/** A connected person's status: what they set by hand, otherwise what their tabs report. */
export const effectiveStatus = (
  status: ActiveStatus,
  manual: ManualStatus | null | undefined,
): PresenceStatus => manual ?? status;

type Entry = { status: PresenceStatus; at: number };

export interface PresenceStore {
  /** Records that these people are connected with these statuses. */
  touch(entries: Array<{ key: string; status: ActiveStatus }>): Promise<void>;
  /** Records that this person's last connection closed. */
  leave(key: string): Promise<void>;
  /** Current presence by participant key. */
  get(keys: string[]): Promise<Map<string, Presence>>;
  /** Sets an admin's status by hand; null goes back to automatic. */
  setManual(key: string, status: ManualStatus | null): Promise<void>;
  getManual(key: string): Promise<ManualStatus | null>;
}

function toPresence(
  entry: Entry | undefined,
  manual: ManualStatus | null | undefined,
  now: number,
): Presence {
  if (manual === 'offline') return { status: 'offline', lastSeenAt: null };
  if (!entry) return { status: 'offline', lastSeenAt: null };
  const fresh = now - entry.at < PRESENCE_TTL_MS && entry.status !== 'offline';
  return {
    status: fresh
      ? effectiveStatus(entry.status as ActiveStatus, manual)
      : 'offline',
    lastSeenAt: new Date(entry.at).toISOString(),
  };
}

const encode = ({ status, at }: Entry) => `${status}:${at}`;

function decode(value: string | null | undefined): Entry | undefined {
  const [status, at] = value?.split(':') ?? [];
  const time = Number(at);
  return (isActiveStatus(status) || status === 'offline') &&
    Number.isFinite(time)
    ? { status, at: time }
    : undefined;
}

/** Presence for this instance only: used without Redis, and while Redis is unreachable. */
export class MemoryPresenceStore implements PresenceStore {
  private readonly entries = new Map<string, Entry>();
  private readonly manual = new Map<string, ManualStatus>();

  constructor(private readonly now: () => number = Date.now) {}

  async touch(entries: Array<{ key: string; status: ActiveStatus }>) {
    const at = this.now();
    for (const { key, status } of entries)
      this.entries.set(key, { status, at });
  }

  async leave(key: string) {
    this.entries.set(key, { status: 'offline', at: this.now() });
  }

  async get(keys: string[]) {
    const now = this.now();
    return new Map(
      keys.map((key) => [
        key,
        toPresence(this.entries.get(key), this.manual.get(key), now),
      ]),
    );
  }

  async setManual(key: string, status: ManualStatus | null) {
    if (status) this.manual.set(key, status);
    else this.manual.delete(key);
  }

  async getManual(key: string) {
    return this.manual.get(key) ?? null;
  }
}

/** Presence in Redis hashes, so every instance sees everyone connected anywhere. */
export class RedisPresenceStore implements PresenceStore {
  constructor(
    private readonly redis: Pick<Redis, 'hset' | 'hmget' | 'hdel' | 'hget'>,
    private readonly fallback: PresenceStore,
    private readonly now: () => number = Date.now,
  ) {}

  async touch(entries: Array<{ key: string; status: ActiveStatus }>) {
    await this.fallback.touch(entries);
    if (entries.length === 0) return;
    const at = this.now();
    await this.redis
      .hset(
        REDIS_KEY,
        Object.fromEntries(
          entries.map(({ key, status }) => [key, encode({ status, at })]),
        ),
      )
      .catch(() => undefined);
  }

  async leave(key: string) {
    await this.fallback.leave(key);
    await this.redis
      .hset(REDIS_KEY, key, encode({ status: 'offline', at: this.now() }))
      .catch(() => undefined);
  }

  async get(keys: string[]) {
    if (keys.length === 0) return new Map<string, Presence>();
    try {
      const [values, manual] = await Promise.all([
        this.redis.hmget(REDIS_KEY, ...keys),
        this.redis.hmget(MANUAL_REDIS_KEY, ...keys),
      ]);
      const now = this.now();
      return new Map(
        keys.map((key, index) => [
          key,
          toPresence(
            decode(values[index]),
            isManualStatus(manual[index]) ? manual[index] : null,
            now,
          ),
        ]),
      );
    } catch {
      return this.fallback.get(keys);
    }
  }

  async setManual(key: string, status: ManualStatus | null) {
    await this.fallback.setManual(key, status);
    await (
      status
        ? this.redis.hset(MANUAL_REDIS_KEY, key, status)
        : this.redis.hdel(MANUAL_REDIS_KEY, key)
    ).catch(() => undefined);
  }

  async getManual(key: string) {
    try {
      const value = await this.redis.hget(MANUAL_REDIS_KEY, key);
      return isManualStatus(value) ? value : null;
    } catch {
      return this.fallback.getManual(key);
    }
  }
}

let store: PresenceStore | undefined;

export function presenceStore(): PresenceStore {
  if (store) return store;
  const memory = new MemoryPresenceStore();
  const redis = getRedis();
  store = redis ? new RedisPresenceStore(redis, memory) : memory;
  return store;
}
