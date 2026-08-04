import { Request, Response, NextFunction } from 'express';
import { tokenService } from '../modules/auth/services/token.service';
import { AppError } from '../common/errors';
import type { JwtPayload } from '../modules/auth/interfaces/auth.interfaces';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestContext?: {
        ipAddress: string;
        userAgent: string;
      };
    }
  }
}

/** Public routes that skip JWT auth */
const PUBLIC_ROUTES = [
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/mfa/verify',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/password/reset-request',
  'POST /api/v1/auth/password/reset',
  'GET /api/v1/health',
  'POST /api/v1/invitations/accept',
  'POST /api/v1/auth/verify-email',
  'GET /api/v1/auth/company/validate',
  'GET /api/v1/auth/company/info',
  'GET /api/v1/auth/sso/initiate',
  'GET /api/v1/auth/sso/callback',
  'GET /api/v1/auth/sso/providers',
];

/**
 * JWT Authentication middleware.
 * Skips public routes, validates access tokens, checks blacklist.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const routeKey = `${req.method} ${req.path}`;
  if (PUBLIC_ROUTES.includes(routeKey)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.tokenInvalid();
  }

  const token = authHeader.slice(7);

  // API key requests are handled by apiKeyAuth middleware, skip JWT here
  if (token.startsWith('pms_sk_')) {
    return next();
  }

  const payload = tokenService.verifyAccessToken(token);

  // Check blacklist (async but we handle it)
  tokenService.isAccessTokenBlacklisted(payload.jti).then((blacklisted) => {
    if (blacklisted) {
      return next(AppError.tokenInvalid());
    }
    req.user = payload;
    next();
  }).catch(next);
}

/**
 * Extracts request context (IP, user agent) for audit logging
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestContext = {
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0',
    userAgent: req.headers['user-agent'] || 'unknown',
  };
  next();
}

/**
 * Global error handler — converts AppError to structured JSON response
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      errors: [{
        code: err.code,
        message: err.message,
        ...(err.meta && { meta: err.meta }),
      }],
    });
    return;
  }

  // Unexpected errors
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    errors: [{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }],
  });
}

/**
 * Wrap async route handlers to catch promise rejections
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
export * from './validateRequest';
export { tenantContextMiddleware } from './tenantContext';
