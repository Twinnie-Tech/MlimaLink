import type Redis from 'ioredis';
import { getRedis } from '../redis';
import {
  isManualStatus,
  type ManualStatus,
  type PresenceStatus,
} from './presence';

/** Someone's status just changed. */
export interface PresenceUpdate {
  key: string;
  status: PresenceStatus;
  /** ISO date string. */
  lastSeenAt: string | null;
  /**
   * Set when an admin changed their status by hand (null: back to automatic), so their
   * tabs on every instance follow. Not passed on to watchers.
   */
  manual?: ManualStatus | null;
}

type Handler = (update: PresenceUpdate) => void;

/** Carries status changes to every instance, so each can tell the people watching. */
export interface PresenceBus {
  publish(update: PresenceUpdate): Promise<void>;
  subscribe(handler: Handler): () => void;
  close(): Promise<void>;
}

const CHANNEL = 'chat:presence-updates';
const STATUSES = new Set([
  'available',
  'busy',
  'dnd',
  'brb',
  'away',
  'offline',
]);

export function parsePresenceUpdate(raw: string): PresenceUpdate | null {
  try {
    const { key, status, lastSeenAt, manual } = JSON.parse(raw) ?? {};
    if (
      typeof key !== 'string' ||
      !STATUSES.has(status) ||
      (lastSeenAt !== null && typeof lastSeenAt !== 'string')
    ) {
      return null;
    }
    const update: PresenceUpdate = { key, status, lastSeenAt };
    if (manual === null || isManualStatus(manual)) update.manual = manual;
    return update;
  } catch {
    return null;
  }
}

/** Only this instance hears its own updates: used without Redis. */
export class LocalPresenceBus implements PresenceBus {
  private readonly handlers = new Set<Handler>();

  async publish(update: PresenceUpdate) {
    this.emit(update);
  }

  emit(update: PresenceUpdate) {
    for (const handler of this.handlers) handler(update);
  }

  subscribe(handler: Handler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async close() {
    this.handlers.clear();
  }
}

type Subscriber = Pick<Redis, 'subscribe' | 'on' | 'quit' | 'disconnect'>;

/**
 * Redis pub/sub: every instance, including this one, hears each update. If Redis is
 * unreachable when publishing, the update still reaches people on this instance.
 */
export class RedisPresenceBus implements PresenceBus {
  private readonly local = new LocalPresenceBus();

  constructor(
    private readonly publisher: Pick<Redis, 'publish'>,
    private readonly subscriber: Subscriber,
  ) {
    subscriber.on('message', (channel: string, raw: string) => {
      if (channel !== CHANNEL) return;
      const update = parsePresenceUpdate(raw);
      if (update) this.local.emit(update);
    });
    subscriber
      .subscribe(CHANNEL)
      .catch((error: Error) =>
        console.error('[presence] subscribe failed:', error.message),
      );
  }

  async publish(update: PresenceUpdate) {
    try {
      await this.publisher.publish(CHANNEL, JSON.stringify(update));
    } catch {
      this.local.emit(update);
    }
  }

  subscribe(handler: Handler) {
    return this.local.subscribe(handler);
  }

  async close() {
    await this.local.close();
    await this.subscriber.quit().catch(() => this.subscriber.disconnect());
  }
}

let bus: PresenceBus | undefined;

export function presenceBus(): PresenceBus {
  if (bus) return bus;
  const redis = getRedis();
  // A subscribed connection can't run other commands, so it gets its own, which waits
  // for the connection instead of failing fast and resubscribes after reconnecting.
  bus = redis
    ? new RedisPresenceBus(
        redis,
        redis.duplicate({
          enableOfflineQueue: true,
          maxRetriesPerRequest: null,
          commandTimeout: undefined,
        }),
      )
    : new LocalPresenceBus();
  return bus;
}

export async function closePresenceBus(): Promise<void> {
  const current = bus;
  bus = undefined;
  await current?.close();
}
