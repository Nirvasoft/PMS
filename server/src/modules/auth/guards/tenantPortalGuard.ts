import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../common/errors';
import { prisma } from '../../../common/database';

/**
 * Middleware guard for tenant/resident portal routes.
 *
 * Ensures the authenticated user is a portal user (Tenant or Resident role)
 * or an admin previewing the portal. If the user has an active resident record,
 * attaches `req.portalContext` with tenant/resident/property/unit info for
 * downstream handlers to use without redundant DB lookups.
 *
 * Usage:
 *   app.use('/api/v1/portal', tenantPortalGuard, portalRouter);
 */
export async function tenantPortalGuard(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    throw AppError.tokenInvalid();
  }

  const userRoles: string[] = req.user.roles || [];

  // Normalize role names for comparison (handle "Super Admin" → "super_admin", etc.)
  const normalizedRoles = userRoles.map((r) => r.toLowerCase().replace(/\s+/g, '_'));

  // Allow admin / super_admin to access portal (for previewing / support)
  const isAdmin = normalizedRoles.some((r) =>
    ['admin', 'super_admin'].includes(r),
  );

  // Allow tenant / resident roles
  const isPortalUser = normalizedRoles.some((r) =>
    ['tenant', 'resident'].includes(r),
  );

  if (!isAdmin && !isPortalUser) {
    throw AppError.forbidden(
      'Portal access requires a Tenant or Resident role. Contact your property manager for access.',
    );
  }

  // Look up the active resident record and attach context
  try {
    const resident = await prisma.resident.findFirst({
      where: {
        companyId: req.user.companyId,
        userId: req.user.sub,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        propertyId: true,
        unitId: true,
        residentType: true,
      },
    });

    // For admin users previewing the portal, resident may not exist — that's OK
    if (resident) {
      req.portalContext = {
        residentId: resident.id,
        tenantId: resident.tenantId,
        propertyId: resident.propertyId,
        unitId: resident.unitId,
        residentType: resident.residentType,
        isAdmin,
      };
    } else if (isAdmin) {
      // Admin previewing — no resident context, but allow through
      req.portalContext = {
        residentId: null,
        tenantId: null,
        propertyId: null,
        unitId: null,
        residentType: null,
        isAdmin: true,
      };
    } else {
      // Non-admin user with Tenant/Resident role but no active resident record
      throw AppError.forbidden(
        'No active residence found. Your portal access may have been revoked.',
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // DB error — let the request through, downstream handlers will catch it
    req.portalContext = null;
  }

  next();
}
