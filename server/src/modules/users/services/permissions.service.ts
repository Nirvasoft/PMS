import { prisma } from '../../../common/database';
import { permissionResolver } from '../helpers/permission-resolver';

export class PermissionsService {
  private apVouchersMigrated = false;

  /** Ensure ap-vouchers has granular create & update permissions instead of legacy write */
  private async ensureApVoucherPermissions() {
    if (this.apVouchersMigrated) return;
    try {
      const [createPerm, updatePerm, legacyWritePerm] = await Promise.all([
        prisma.permission.upsert({
          where: { code: 'ap-vouchers.create' },
          create: { code: 'ap-vouchers.create', name: 'Create Payment Vouchers', module: 'ap-vouchers', action: 'create', isActive: true },
          update: { name: 'Create Payment Vouchers', module: 'ap-vouchers', action: 'create', isActive: true },
        }),
        prisma.permission.upsert({
          where: { code: 'ap-vouchers.update' },
          create: { code: 'ap-vouchers.update', name: 'Update Payment Vouchers', module: 'ap-vouchers', action: 'update', isActive: true },
          update: { name: 'Update Payment Vouchers', module: 'ap-vouchers', action: 'update', isActive: true },
        }),
        prisma.permission.findUnique({ where: { code: 'ap-vouchers.write' } }),
      ]);

      if (legacyWritePerm && legacyWritePerm.isActive) {
        // Migrate existing role permissions from ap-vouchers.write -> create & update
        const existingRolePerms = await prisma.rolePermission.findMany({
          where: { permissionId: legacyWritePerm.id },
        });
        for (const rp of existingRolePerms) {
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: rp.roleId, permissionId: createPerm.id } },
            create: { roleId: rp.roleId, permissionId: createPerm.id, grantedBy: rp.grantedBy },
            update: {},
          });
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: rp.roleId, permissionId: updatePerm.id } },
            create: { roleId: rp.roleId, permissionId: updatePerm.id, grantedBy: rp.grantedBy },
            update: {},
          });
        }

        // Migrate user overrides if any
        const existingOverrides = await prisma.userPermissionOverride.findMany({
          where: { permissionId: legacyWritePerm.id },
        });
        for (const ov of existingOverrides) {
          await prisma.userPermissionOverride.upsert({
            where: { uq_user_perm_override: { userId: ov.userId, permissionId: createPerm.id } },
            create: {
              userId: ov.userId,
              permissionId: createPerm.id,
              overrideType: ov.overrideType,
              reason: ov.reason,
              expiresAt: ov.expiresAt,
              grantedBy: ov.grantedBy,
            },
            update: {},
          });
          await prisma.userPermissionOverride.upsert({
            where: { uq_user_perm_override: { userId: ov.userId, permissionId: updatePerm.id } },
            create: {
              userId: ov.userId,
              permissionId: updatePerm.id,
              overrideType: ov.overrideType,
              reason: ov.reason,
              expiresAt: ov.expiresAt,
              grantedBy: ov.grantedBy,
            },
            update: {},
          });
        }

        await prisma.permission.update({
          where: { id: legacyWritePerm.id },
          data: { isActive: false },
        });
        await permissionResolver.invalidateAllCaches();
      } else {
        // Ensure system roles (Super Admin) have create & update
        const systemRoles = await prisma.role.findMany({ where: { isSystem: true }, select: { id: true } });
        for (const role of systemRoles) {
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: createPerm.id } },
            create: { roleId: role.id, permissionId: createPerm.id },
            update: {},
          });
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: updatePerm.id } },
            create: { roleId: role.id, permissionId: updatePerm.id },
            update: {},
          });
        }
      }

      this.apVouchersMigrated = true;
    } catch {
      // Non-fatal fallback
    }
  }

  /** Get all permissions grouped by module */
  async findAllGrouped(moduleFilter?: string) {
    await this.ensureApVoucherPermissions();
    const where = moduleFilter ? { module: moduleFilter, isActive: true } : { isActive: true };
    const permissions = await prisma.permission.findMany({
      where,
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    // Group by module
    const grouped: Record<string, Array<{ code: string; name: string; action: string; description: string | null }>> = {};
    for (const p of permissions) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push({
        code: p.code,
        name: p.name,
        action: p.action,
        description: p.description,
      });
    }

    return grouped;
  }
}

export const permissionsService = new PermissionsService();
