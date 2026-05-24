import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../common/database';
import { setTenantContext } from '../common/database';
import { logger } from '../common/logger';

// ═════════════════════════════════════════
// API KEY AUTHENTICATION MIDDLEWARE
// ═════════════════════════════════════════

/** In-memory rate limit tracker: keyId → { count, windowStart } */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

/**
 * Middleware that authenticates requests using API keys (`Authorization: Bearer pms_sk_*`).
 * Checks key validity, expiration, scope, and rate limits.
 *
 * Use as: `router.use('/api/v1/external', apiKeyAuth('leases:read'))`
 * Or without scope: `router.use('/api/v1/external', apiKeyAuth())`
 */
export function apiKeyAuth(...requiredScopes: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer pms_sk_')) {
      // Not an API key request — skip (let JWT middleware handle it)
      return next();
    }

    const rawKey = authHeader.slice(7); // Remove 'Bearer '

    try {
      // Hash the key and look it up
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { company: { select: { id: true, code: true, isActive: true } } },
      });

      if (!apiKey) {
        res.status(401).json({
          success: false,
          errors: [{ code: 'INVALID_API_KEY', message: 'Invalid API key' }],
        });
        return;
      }

      // Check if active
      if (!apiKey.isActive) {
        res.status(401).json({
          success: false,
          errors: [{ code: 'API_KEY_REVOKED', message: 'API key has been revoked' }],
        });
        return;
      }

      // Check expiration
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        res.status(401).json({
          success: false,
          errors: [{ code: 'API_KEY_EXPIRED', message: 'API key has expired' }],
        });
        return;
      }

      // Check company is active
      if (!apiKey.company?.isActive) {
        res.status(403).json({
          success: false,
          errors: [{ code: 'COMPANY_INACTIVE', message: 'Company is inactive' }],
        });
        return;
      }

      // Check scopes
      if (requiredScopes.length > 0) {
        const keyScopes = new Set(apiKey.scopes);
        const missing = requiredScopes.filter(s => !keyScopes.has(s));
        if (missing.length > 0) {
          res.status(403).json({
            success: false,
            errors: [{
              code: 'INSUFFICIENT_SCOPE',
              message: `API key missing required scope(s): ${missing.join(', ')}`,
            }],
          });
          return;
        }
      }

      // Rate limiting (sliding window per minute)
      const now = Date.now();
      const windowMs = 60_000; // 1 minute
      const limit = apiKey.rateLimitRpm ?? 100;

      let tracker = rateLimitMap.get(apiKey.id);
      if (!tracker || now - tracker.windowStart > windowMs) {
        tracker = { count: 0, windowStart: now };
        rateLimitMap.set(apiKey.id, tracker);
      }

      tracker.count++;

      if (tracker.count > limit) {
        res.status(429).json({
          success: false,
          errors: [{
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded: ${limit} requests per minute`,
          }],
        });
        return;
      }

      // Set rate limit headers
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(Math.max(0, limit - tracker.count)));
      res.set('X-RateLimit-Reset', String(Math.ceil((tracker.windowStart + windowMs) / 1000)));

      // Set tenant context for RLS
      await setTenantContext(apiKey.companyId);

      // Attach pseudo-user to request (API key acts as service account)
      req.user = {
        sub: apiKey.createdBy,
        email: `apikey:${apiKey.keyPrefix}`,
        companyId: apiKey.companyId,
        roles: ['api_key'],
        permissions: apiKey.scopes,
        jti: apiKey.id,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 900,
      } as any;

      // Update last used timestamp (fire-and-forget)
      prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => { /* ignore */ });

      logger.debug(`API key ${apiKey.keyPrefix}... authenticated for ${req.method} ${req.path}`);
      next();

    } catch (err) {
      next(err);
    }
  };
}

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, tracker] of rateLimitMap) {
    if (now - tracker.windowStart > 120_000) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60_000);
