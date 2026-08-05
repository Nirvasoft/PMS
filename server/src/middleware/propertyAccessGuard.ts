/**
 * Property Access Guard — scopes data access based on user's property-level role assignments.
 *
 * Users with role assignments scoped to a specific `propertyId` (via `user_roles.property_id`)
 * can only access data for their assigned properties. Users with no property scoping
 * (property_id = null on all their roles) have company-wide access.
 *
 * Usage:
 *   router.get('/:propertyId/units', propertyAccessGuard, asyncHandler(...));
 *   // or as factory with param name:
 *   router.get('/props/:id/units', createPropertyAccessGuard('id'), asyncHandler(...));
 */
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../common/database';
import { AppError } from '../common/errors';

/**
 * Resolve the set of property IDs a user is explicitly scoped to.
 * Returns empty array if user has company-wide access (no property scoping).
 */
async function resolveUserPropertyIds(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { propertyId: true },
  });

  // If any role has null propertyId → user has company-wide access
  const hasCompanyWide = userRoles.some((ur) => ur.propertyId === null);
  if (hasCompanyWide) return [];

  // Otherwise return the distinct list of property IDs
  const ids = userRoles
    .map((ur) => ur.propertyId)
    .filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/**
 * Standard middleware — reads propertyId from `req.params.propertyId` or `req.params.id`.
 */
export async function propertyAccessGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const propertyId = (req.params.propertyId || req.params.id) as string | undefined;
  if (!propertyId || !req.user) return next();

  // Admin role bypasses property scoping
  if (req.user.roles.includes('Admin') || req.user.roles.includes('admin') || req.user.roles.includes('Super Admin')) {
    return next();
  }

  const allowedPropertyIds = await resolveUserPropertyIds(req.user.sub);

  // Empty array = company-wide access → allow
  if (allowedPropertyIds.length === 0) return next();

  // Check if the requested property is in the user's allowed list
  if (!allowedPropertyIds.includes(propertyId)) {
    throw new AppError(403, 'PROPERTY_ACCESS_DENIED', 'You do not have access to this property');
  }

  next();
}

/**
 * Factory function — specify which req.params key holds the property ID.
 */
export function createPropertyAccessGuard(paramKey: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const propertyId = req.params[paramKey] as string | undefined;
    if (!propertyId || !req.user) return next();

    if (req.user.roles.includes('Admin') || req.user.roles.includes('admin') || req.user.roles.includes('Super Admin')) {
      return next();
    }

    const allowedPropertyIds = await resolveUserPropertyIds(req.user.sub);
    if (allowedPropertyIds.length === 0) return next();

    if (!allowedPropertyIds.includes(propertyId)) {
      throw new AppError(403, 'PROPERTY_ACCESS_DENIED', 'You do not have access to this property');
    }

    next();
  };
}

/**
 * Utility: get the list of property IDs a user can access.
 * Used in list queries to filter results by allowed properties.
 * Returns null if user has company-wide access (no filtering needed).
 */
export async function getUserPropertyScope(userId: string): Promise<string[] | null> {
  const ids = await resolveUserPropertyIds(userId);
  return ids.length > 0 ? ids : null;
}
