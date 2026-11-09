import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../common/errors';

/**
 * Tiny in-memory per-IP limiter for the unauthenticated public endpoints (one process; each instance keeps its own
 * counters). Over the limit -> 429 RATE_LIMITED.
 */
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 2000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }
    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) throw AppError.rateLimited();
    next();
  };
}
