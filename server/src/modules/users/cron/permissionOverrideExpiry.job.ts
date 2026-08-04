import cron from 'node-cron';
import { prisma } from '../../../common/database';
import { Prisma } from '@prisma/client';
import { redis } from '../../../common/redis';
import { logger } from '../../../common/logger';

/**
 * Permission Override Expiry Cron
 * 
 * Runs every hour at :15 minutes past.
 * 
 * 1. Finds all UserPermissionOverride records where expiresAt < NOW()
 * 2. Collects affected user IDs
 * 3. Deletes the expired overrides
 * 4. Invalidates the permission cache for each affected user
 * 5. Writes an audit log entry for each expired override
 */
export function startPermissionOverrideExpiryJob() {
  cron.schedule('15 * * * *', async () => {
    const jobStart = Date.now();
    try {
      const now = new Date();

      // Find expired overrides
      const expiredOverrides = await prisma.userPermissionOverride.findMany({
        where: {
          expiresAt: { not: null, lt: now },
        },
        include: {
          permission: { select: { code: true, name: true } },
          user: { select: { id: true, email: true, companyId: true } },
        },
      });

      if (expiredOverrides.length === 0) {
        return; // Nothing to do
      }

      logger.info(`[PermOverrideExpiry] Found ${expiredOverrides.length} expired override(s)`);

      // Collect unique user IDs for cache invalidation
      const affectedUserIds = [...new Set(expiredOverrides.map(o => o.userId))];

      // Delete all expired overrides in one batch
      const deleteResult = await prisma.userPermissionOverride.deleteMany({
        where: {
          expiresAt: { not: null, lt: now },
        },
      });

      logger.info(`[PermOverrideExpiry] Deleted ${deleteResult.count} expired override(s)`);

      // Write audit log entries for each expired override
      const auditEntries = expiredOverrides.map(o => ({
        userId: o.userId,
        email: o.user.email,
        companyId: o.user.companyId,
        eventType: 'permission_override_expired' as const,
        status: 'success' as const,
        metadata: {
          permissionCode: o.permission.code,
          permissionName: o.permission.name,
          overrideType: o.overrideType,
          expiredAt: o.expiresAt?.toISOString(),
          reason: o.reason,
        },
      }));

      // Batch insert audit logs
      await prisma.authAuditLog.createMany({
        data: auditEntries.map(e => ({
          userId: e.userId,
          email: e.email,
          companyId: e.companyId,
          eventType: e.eventType,
          status: e.status,
          metadata: e.metadata as unknown as Prisma.JsonObject,
        })),
      });

      // Invalidate permission cache for all affected users
      for (const userId of affectedUserIds) {
        const keys = await redis.keys(`perms:${userId}:*`);
        if (keys.length) await redis.del(...keys);
      }

      const elapsed = Date.now() - jobStart;
      logger.info(
        `[PermOverrideExpiry] Completed: ${deleteResult.count} overrides expired, ` +
        `${affectedUserIds.length} user caches invalidated, ` +
        `${auditEntries.length} audit entries written (${elapsed}ms)`,
      );
    } catch (error) {
      logger.error('[PermOverrideExpiry] Cron job failed:', error);
    }
  });

  logger.info('⏰ Permission override expiry cron scheduled (every hour at :15)');
}
