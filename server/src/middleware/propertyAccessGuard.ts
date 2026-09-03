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
 *
 * Two independent scoping layers feed into this, combined per assignment:
 * - Assignment-level: `user_roles.property_id` (a role granted to this user for one property only).
 * - Role-level: `role_properties` rows on the Role itself (the "All Properties" picker in Roles &
 *   Permissions), which apply when the assignment itself is unscoped (`property_id` is null).
 * Any single assignment that resolves to company-wide access (an unscoped assignment of an
 * unrestricted role) grants company-wide access overall, matching the pre-existing OR semantics.
 */
async function resolveUserPropertyIds(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: {
      propertyId: true,
      role: { select: { isActive: true, roleProperties: { select: { propertyId: true } } } },
    },
  });

  const ids = new Set<string>();
  for (const ur of userRoles) {
    if (!ur.role.isActive) continue;

    if (ur.propertyId) {
      // Assignment scoped to a single property — always restricts to that property.
      ids.add(ur.propertyId);
      continue;
    }

    // Assignment unscoped — falls back to the role's own property scope.
    if (ur.role.roleProperties.length === 0) {
      return []; // this assignment grants company-wide access
    }
    for (const rp of ur.role.roleProperties) ids.add(rp.propertyId);
  }
  return [...ids];
}

/**
 * Resolve the set of floor numbers a user is scoped to via their roles' "All Floor" picker.
 * Returns null if the user has unrestricted floor access (no floor scoping on any role).
 */
export async function getUserFloorScope(userId: string): Promise<number[] | null> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: { select: { isActive: true, roleFloors: { select: { floorNumber: true } } } },
    },
  });

  const floors = new Set<number>();
  for (const ur of userRoles) {
    if (!ur.role.isActive) continue;
    if (ur.role.roleFloors.length === 0) return null; // this role grants unrestricted floor access
    for (const rf of ur.role.roleFloors) floors.add(rf.floorNumber);
  }
  // No active roles at all → treat like resolveUserPropertyIds: unrestricted rather than blocked.
  return floors.size > 0 ? [...floors] : null;
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
