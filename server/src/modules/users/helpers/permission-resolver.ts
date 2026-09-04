import { prisma } from '../../../common/database';
import { redis } from '../../../common/redis';
import { config } from '../../../common/config';
import { logger } from '../../../common/logger';

// redis.keys() does NOT auto-prefix like get/set/del, so the prefix must be prepended
// to the pattern manually, and stripped again from whatever keys() returns before
// passing them to del() (which re-adds the prefix itself). See token.service.ts.
const KEY_PREFIX = config.redis.prefix || '';

/**
 * Resolves the effective permission codes for a user.
 * Cache TTL: 5 minutes. Invalidated on role/permission/override change.
 *
 * Resolution order:
 * 1. Union all permissions from all active user roles
 * 2. Apply 'grant' overrides (add even if no role grants it)
 * 3. Apply 'revoke' overrides (remove even if role grants it)
 * 4. Filter out expired entries
 */
export class PermissionResolver {
  async getEffectivePermissions(userId: string, propertyId?: string): Promise<string[]> {
    const cacheKey = `perms:${userId}:${propertyId ?? 'all'}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();

    // Step 1: Collect permissions from all user roles (including property-scoped)
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { propertyId: null },
          ...(propertyId ? [{ propertyId }] : []),
        ],
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
            roleProperties: { select: { propertyId: true } },
          },
        },
      },
    });

    const permSet = new Set<string>();
    for (const ur of userRoles) {
      // Skip expired role assignments
      if (ur.expiresAt && ur.expiresAt < now) continue;
      if (!ur.role.isActive) continue;

      // Role-level property scope: no rows = unrestricted (all properties).
      // When scoped, the requested property must be in the role's allow-list.
      if (propertyId && ur.role.roleProperties.length > 0) {
        const allowed = ur.role.roleProperties.some((rp) => rp.propertyId === propertyId);
        if (!allowed) continue;
      }

      for (const rp of ur.role.rolePermissions) {
        if (rp.permission.isActive) {
          permSet.add(rp.permission.code);
        }
      }
    }

    // Step 2: Apply per-user overrides
    const overrides = await prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: true },
    });

    for (const o of overrides) {
      // Skip expired overrides
      if (o.expiresAt && o.expiresAt < now) continue;

      if (o.overrideType === 'grant') {
        permSet.add(o.permission.code);
      } else if (o.overrideType === 'revoke') {
        permSet.delete(o.permission.code);
      }
    }

    const result = Array.from(permSet);
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return result;
  }

  async invalidateCache(userId: string): Promise<void> {
    const rawKeys = await redis.keys(`${KEY_PREFIX}perms:${userId}:*`);
    const keys = rawKeys.map((k) => (k.startsWith(KEY_PREFIX) ? k.slice(KEY_PREFIX.length) : k));
    if (keys.length) await redis.del(...keys);
  }

  async invalidateCacheForRole(roleId: string): Promise<void> {
    const userRoles = await prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    const userIds = [...new Set(userRoles.map((ur) => ur.userId))];
    for (const uid of userIds) {
      await this.invalidateCache(uid);
    }
    logger.debug(`Permission cache invalidated for ${userIds.length} users (role ${roleId})`);
  }
}

export const permissionResolver = new PermissionResolver();
