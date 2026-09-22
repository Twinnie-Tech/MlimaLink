import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redisClient.on('error', (error) => {
  console.error('[redis]', error.message);
});

export async function ensureRedisConnected(): Promise<void> {
  if (redisClient.status === 'ready' || redisClient.status === 'connecting') {
    return;
  }
  await redisClient.connect();
}
