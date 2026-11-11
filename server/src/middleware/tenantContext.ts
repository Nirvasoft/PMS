import { Request, Response, NextFunction } from 'express';
import { setTenantContext } from '../common/database';
import { logger } from '../common/logger';

/**
 * Tenant Context Middleware
 * 
 * Sets the PostgreSQL session variable `app.current_company_id` for
 * Row-Level Security (RLS) enforcement. Must run AFTER authMiddleware
 * which populates `req.user`.
 * 
 * For unauthenticated routes, this is a no-op — the RLS variable
 * remains unset, meaning RLS-protected tables return zero rows.
 * This is safe because unauthenticated routes only access the
 * `companies` table (which is NOT RLS-protected).
 */
export async function tenantContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user?.companyId) {
      await setTenantContext(req.user.companyId);
    }
    next();
  } catch (err) {
    logger.error('Failed to set tenant context', err);
    next(err);
  }
}
