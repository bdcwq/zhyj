import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = globalForRedis.redis ?? new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
  });

  if (process.env.NODE_ENV !== 'production') globalForRedis.redis = client;
  return client;
}

export const redis = createRedisClient();

export type RedisStatus = 'ok' | 'error' | 'disabled';

export async function getRedisStatus(): Promise<{ status: RedisStatus; error?: string }> {
  if (!redis) return { status: 'disabled' };
  try {
    await redis.ping();
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
