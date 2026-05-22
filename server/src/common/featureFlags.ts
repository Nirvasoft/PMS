import type { Request, Response, NextFunction } from 'express';
import { prisma } from './database';

/**
 * Map of feature flag keys to their settings key in Company.settings JSON.
 * Used by the requireFeature middleware to check if a module is enabled.
 */
type FeatureFlagKey =
  | 'crmEnabled'
  | 'parkingEnabled'
  | 'workflowEnabled'
  | 'documentVaultEnabled'
  | 'notificationsAdminEnabled'
  | 'leasingEnabled'
  | 'maintenanceEnabled';

// Simple in-memory cache to avoid hitting the DB on every request
const flagCache = new Map<string, { settings: Record<string, unknown>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

async function getCompanySettings(companyId: string): Promise<Record<string, unknown>> {
  const cached = flagCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.settings;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { settings: true },
  });

  const settings = (company?.settings ?? {}) as Record<string, unknown>;
  flagCache.set(companyId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
  return settings;
}

/**
 * Invalidate the feature flag cache for a company.
 * Call this when company settings are updated.
 */
export function invalidateFeatureFlagCache(companyId: string): void {
  flagCache.delete(companyId);
}

/**
 * Express middleware that checks if a feature flag is enabled for the user's company.
 * If the flag is not explicitly set, it defaults to enabled (true).
 * Returns 403 if the feature is disabled.
 *
 * Usage:
 *   router.use(requireFeature('parkingEnabled'));
 *   // or per-route:
 *   router.get('/', requireFeature('crmEnabled'), handler);
 */
export function requireFeature(flag: FeatureFlagKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        next(); // Let auth middleware handle this
        return;
      }

      const settings = await getCompanySettings(companyId);
      const value = settings[flag];

      // Default to true (enabled) if not explicitly set
      const isEnabled = value === undefined || value === null ? true : Boolean(value);

      if (!isEnabled) {
        res.status(403).json({
          success: false,
          errors: [{ message: `This feature is disabled for your organization. Contact your administrator to enable it.` }],
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
