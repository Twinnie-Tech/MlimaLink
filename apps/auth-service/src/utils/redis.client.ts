import '../env';
import Redis from 'ioredis';

function resolveRedisUrl(): string {
  const raw = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  // Upstash requires TLS — use rediss://
  if (raw.includes('upstash.io') && raw.startsWith('redis://')) {
    return raw.replace(/^redis:\/\//, 'rediss://');
  }
  return raw;
}

const redisUrl = resolveRedisUrl();

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
});

redisClient.on('error', (error) => {
  console.error('[redis]', error.message);
});

export async function ensureRedisConnected(): Promise<void> {
  if (redisClient.status === 'ready') {
    return;
  }

  if (redisClient.status === 'end' || redisClient.status === 'close') {
    await redisClient.connect();
    return;
  }

  if (redisClient.status === 'wait') {
    await redisClient.connect();
  }
}
