import { prisma } from '../../../common/database';
import { permissionResolver } from '../helpers/permission-resolver';

/**
 * Finance setup menus that previously shared Chart of Accounts permissions now have their own.
 * `legacyRead` / `legacyWrite` are the codes whose holders inherit the new permissions once,
 * the first time each new permission is created (so existing users keep their menus).
 */
const FINANCE_SETUP_PERMISSION_MODULES = [
  { module: 'finance-departments', label: 'Department Centers' },
  { module: 'finance-cost-centers', label: 'Cost Centers' },
  { module: 'finance-payment-methods', label: 'Payment Methods' },
] as const;

const FINANCE_SETUP_ACTIONS = [
  { action: 'read', verb: 'View', legacy: 'finance-coa.read' },
  { action: 'create', verb: 'Create', legacy: 'finance-coa.write' },
  { action: 'update', verb: 'Update', legacy: 'finance-coa.write' },
  { action: 'delete', verb: 'Delete', legacy: 'finance-coa.write' },
] as const;

export class PermissionsService {
  private apVouchersMigrated = false;
  private financeSetupMigrated = false;

  /**
   * Ensure Department Centers, Cost Centers, and Payment Methods each have their own
   * read/create/update/delete permissions. A newly created permission is granted to every
   * role (and user override) holding the matching legacy Chart of Accounts permission, plus
   * all system roles. Existing permissions are left untouched so admin changes are preserved.
   */
  async ensureFinanceSetupPermissions() {
    if (this.financeSetupMigrated) return;
    try {
      const legacyCodes = Array.from(new Set(FINANCE_SETUP_ACTIONS.map((a) => a.legacy)));
      const legacyPerms = await prisma.permission.findMany({
        where: { code: { in: legacyCodes } },
        select: { id: true, code: true },
      });
      const legacyIdByCode = new Map(legacyPerms.map((p) => [p.code, p.id]));
      const systemRoles = await prisma.role.findMany({ where: { isSystem: true }, select: { id: true } });
      let granted = false;

      for (const { module, label } of FINANCE_SETUP_PERMISSION_MODULES) {
        for (const { action, verb, legacy } of FINANCE_SETUP_ACTIONS) {
          const code = `${module}.${action}`;
          const name = `${verb} ${label}`;
          const existing = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
          if (existing) continue;

          const perm = await prisma.permission.create({
            data: { code, name, module, action, isActive: true },
          });

          const legacyId = legacyIdByCode.get(legacy);
          const roleIds = new Set(systemRoles.map((r) => r.id));
          if (legacyId) {
            const legacyRolePerms = await prisma.rolePermission.findMany({
              where: { permissionId: legacyId },
              select: { roleId: true },
            });
            legacyRolePerms.forEach((rp) => roleIds.add(rp.roleId));

            const legacyOverrides = await prisma.userPermissionOverride.findMany({
              where: { permissionId: legacyId },
            });
            for (const ov of legacyOverrides) {
              await prisma.userPermissionOverride.upsert({
                where: { uq_user_perm_override: { userId: ov.userId, permissionId: perm.id } },
                create: {
                  userId: ov.userId,
                  permissionId: perm.id,
                  overrideType: ov.overrideType,
                  reason: ov.reason,
                  expiresAt: ov.expiresAt,
                  grantedBy: ov.grantedBy,
                },
                update: {},
              });
            }
          }

          for (const roleId of roleIds) {
            await prisma.rolePermission.upsert({
              where: { roleId_permissionId: { roleId, permissionId: perm.id } },
              create: { roleId, permissionId: perm.id },
              update: {},
            });
          }
          granted = true;
        }
      }

      if (granted) await permissionResolver.invalidateAllCaches();
      this.financeSetupMigrated = true;
    } catch {
      // Non-fatal fallback
    }
  }

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
    await Promise.all([this.ensureApVoucherPermissions(), this.ensureFinanceSetupPermissions()]);
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
