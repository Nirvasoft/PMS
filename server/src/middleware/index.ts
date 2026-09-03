import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
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
      /** Populated by TenantPortalGuard for /portal routes */
      portalContext?: {
        residentId: string | null;
        tenantId: string | null;
        propertyId: string | null;
        unitId: string | null;
        residentType: string | null;
        isAdmin: boolean;
      } | null;
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
      errors: [{ code: err.code, message: err.message, ...(err.meta && { meta: err.meta }) }],
    });
    return;
  }

  // Zod validation errors — surface field-level messages as 422
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    res.status(422).json({
      success: false,
      errors: [{ code: 'VALIDATION_ERROR', message }],
    });
    return;
  }

  // Upload errors (multer) are the caller's fault, not ours — surface the
  // real reason as a 400 instead of burying it in a generic 500.
  if (err instanceof MulterError) {
    res.status(400).json({
      success: false,
      errors: [{ code: `UPLOAD_${err.code}`, message: err.message }],
    });
    return;
  }
  if (isFileFilterRejection(err)) {
    res.status(400).json({
      success: false,
      errors: [{ code: 'UPLOAD_REJECTED', message: err.message }],
    });
    return;
  }

  // Prisma known request errors
  if ((err as any).code?.startsWith('P')) {
    const prismaCode = (err as any).code as string;
    const meta = (err as any).meta as Record<string, unknown> | undefined;

    let statusCode = 400;
    let message = 'Database error';

    switch (prismaCode) {
      case 'P2002':
        message = `A record with this ${meta?.target ? (meta.target as string[]).join(', ') : 'value'} already exists`;
        statusCode = 409;
        break;
      case 'P2003':
        message = `Referenced record does not exist (foreign key constraint on ${meta?.field_name ?? 'unknown field'})`;
        statusCode = 400;
        break;
      case 'P2025':
        message = (meta?.cause as string) ?? 'Record not found';
        statusCode = 404;
        break;
      default:
        message = (err as any).message ?? 'Database error';
        statusCode = 500;
    }

    console.error(`Prisma error [${prismaCode}]:`, err);
    res.status(statusCode).json({
      success: false,
      errors: [{ code: prismaCode, message }],
    });
    return;
  }

  // Unexpected errors
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    errors: [{ code: 'INTERNAL_ERROR', message: (err as any).message || 'An unexpected error occurred' }],
  });
}

/**
 * Our multer fileFilter callbacks reject with a plain Error, which multer
 * forwards untouched — so it is matched on the message the filters produce.
 */
function isFileFilterRejection(err: Error): boolean {
  return /^Only .+ (are|is) allowed$/i.test(err.message);
}

/**
 * Wrap async route handlers to catch promise rejections
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
export * from './validateRequest';
export { tenantContextMiddleware } from './tenantContext';
export { propertyAccessGuard, createPropertyAccessGuard, getUserPropertyScope, getUserFloorScope } from './propertyAccessGuard';
