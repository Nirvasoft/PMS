import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

// ─── In-Memory Fallback ──────────────────────────────────
// When REDIS_URL is not set, we use a simple Map-based cache
// that mimics the ioredis API surface used in this project.
// This is suitable for single-instance deployments.

class MemoryStore {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<string | null> {
    const prefixedKey = `${config.redis.prefix}${key}`;
    if (this.isExpired(prefixedKey)) return null;
    return this.store.get(prefixedKey)?.value ?? null;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<'OK'> {
    const prefixedKey = `${config.redis.prefix}${key}`;
    const expiresAt = mode === 'EX' && ttl ? Date.now() + ttl * 1000 : null;
    this.store.set(prefixedKey, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      const prefixedKey = `${config.redis.prefix}${key}`;
      if (this.store.delete(prefixedKey)) count++;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    // Simple glob matching for patterns like "pms:refresh:userId:*"
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (!this.isExpired(key) && regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }
}

// ─── Redis / Memory Toggle ──────────────────────────────
const useRedis = !!config.redis.url && config.redis.url !== 'redis://localhost:6379' || process.env.FORCE_REDIS === 'true';

type RedisLike = Pick<Redis, 'get' | 'set' | 'del' | 'keys' | 'quit'>;

let redis: RedisLike;

if (useRedis) {
  const ioredis = new Redis(config.redis.url, {
    keyPrefix: config.redis.prefix,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 5) {
        logger.error('Redis connection failed after 5 retries');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
  });

  ioredis.on('connect', () => logger.info('✅ Redis connected'));
  ioredis.on('error', (err) => logger.error('Redis error:', err.message));

  redis = ioredis;
} else {
  logger.info('⚡ Redis not configured — using in-memory cache (single-instance only)');
  redis = new MemoryStore() as unknown as RedisLike;
}

export { redis };

export async function disconnectRedis(): Promise<void> {
  if (useRedis) {
    await (redis as Redis).quit();
    logger.info('Redis disconnected');
  }
}
