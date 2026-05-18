import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

export const redis = new Redis(config.redis.url, {
  keyPrefix: config.redis.prefix,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 5) {
      logger.error('Redis connection failed after 5 retries');
      return null; // stop retrying
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error('Redis error:', err.message));

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis disconnected');
}
