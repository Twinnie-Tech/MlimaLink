import Redis from 'ioredis';

let client: Redis | null | undefined;

/** Upstash needs TLS, so a plain redis:// URL for it becomes rediss://. */
export function resolveRedisUrl(raw: string): string {
  return raw.includes('upstash.io') && raw.startsWith('redis://')
    ? raw.replace(/^redis:\/\//, 'rediss://')
    : raw;
}

/**
 * The shared Redis connection, or null when REDIS_URL isn't set. Commands fail at once
 * while it's disconnected instead of queueing, so callers can fall back.
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) return (client = null);

  const url = resolveRedisUrl(raw);
  client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
    tls: url.startsWith('rediss://') ? {} : undefined,
  });
  client.on('error', (error) => console.error('[redis]', error.message));
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  const current = client;
  client = undefined;
  await current.quit().catch(() => current.disconnect());
}
