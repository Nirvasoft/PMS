import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../common/errors';

/**
 * Middleware factory: requires the authenticated user to have at least one of the specified roles.
 *
 * Usage:
 *   router.get('/admin-only', requireRole('Super Admin', 'Admin'), handler);
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw AppError.tokenInvalid();
    }

    const userRoles: string[] = req.user.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw AppError.forbidden(
        `This action requires one of these roles: ${roles.join(', ')}`,
      );
    }

    next();
  };
}

/**
 * Middleware factory: requires the authenticated user to have at least one of the specified permissions.
 *
 * Usage:
 *   router.post('/provision', requirePermission('companies.provision'), handler);
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw AppError.tokenInvalid();
    }

    const userPerms: string[] = req.user.permissions || [];
    const hasPermission = permissions.some((perm) => userPerms.includes(perm));

    if (!hasPermission) {
      throw AppError.forbidden(
        `This action requires one of these permissions: ${permissions.join(', ')}`,
      );
    }

    next();
  };
}
