import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { permissionResolver } from '../helpers/permission-resolver';

export class RolesService {
  /** List roles for a company */
  async findAll(companyId: string, includePermissions = false) {
    if (includePermissions) {
      const roles = await prisma.role.findMany({
        where: { companyId },
        include: {
          rolePermissions: { include: { permission: true } },
          _count: { select: { userRoles: true } },
        },
        orderBy: { name: 'asc' },
      });
      return roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        isActive: r.isActive,
        userCount: r._count.userRoles,
        permissionCount: r.rolePermissions.length,
        permissions: r.rolePermissions.map((rp) => ({
          code: rp.permission.code,
          name: rp.permission.name,
          module: rp.permission.module,
          action: rp.permission.action,
        })),
      }));
    }

    const roles = await prisma.role.findMany({
      where: { companyId },
      include: { _count: { select: { userRoles: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isActive: r.isActive,
      userCount: r._count.userRoles,
    }));
  }

  /** Get single role with permissions and property/floor scope */
  async findById(roleId: string) {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: { include: { permission: true } },
        roleProperties: { include: { property: { select: { id: true, name: true } } } },
        roleFloors: true,
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw AppError.notFound('Role');
    return {
      ...role,
      permissions: role.rolePermissions.map((rp) => rp.permission),
      properties: role.roleProperties.map((rp) => rp.property),
      propertyIds: role.roleProperties.map((rp) => rp.propertyId),
      floorNumbers: role.roleFloors.map((rf) => rf.floorNumber).sort((a, b) => a - b),
      userCount: role._count.userRoles,
    };
  }

  /** Filter propertyIds down to ones that actually belong to this company */
  private async resolveCompanyPropertyIds(propertyIds: string[], companyId: string): Promise<string[]> {
    if (propertyIds.length === 0) return [];
    const properties = await prisma.property.findMany({
      where: { id: { in: propertyIds }, companyId },
      select: { id: true },
    });
    return properties.map((p) => p.id);
  }

  private normalizeFloorNumbers(floorNumbers: number[]): number[] {
    return [...new Set(floorNumbers.filter((n) => Number.isInteger(n) && n > 0))];
  }

  /** Create a new role with permissions and optional property/floor scope */
  async create(
    dto: { name: string; description?: string; permissionCodes: string[]; propertyIds?: string[]; floorNumbers?: number[] },
    companyId: string,
    createdBy: string,
  ) {
    // Find permission IDs from codes
    const permissions = await prisma.permission.findMany({
      where: { code: { in: dto.permissionCodes }, isActive: true },
    });
    const propertyIds = dto.propertyIds ? await this.resolveCompanyPropertyIds(dto.propertyIds, companyId) : [];
    const floorNumbers = dto.floorNumbers ? this.normalizeFloorNumbers(dto.floorNumbers) : [];

    const role = await prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description,
          createdBy,
        },
      });

      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: r.id,
            permissionId: p.id,
            grantedBy: createdBy,
          })),
        });
      }

      if (propertyIds.length > 0) {
        await tx.roleProperty.createMany({
          data: propertyIds.map((propertyId) => ({ roleId: r.id, propertyId })),
        });
      }

      if (floorNumbers.length > 0) {
        await tx.roleFloor.createMany({
          data: floorNumbers.map((floorNumber) => ({ roleId: r.id, floorNumber })),
        });
      }

      return r;
    });

    return this.findById(role.id);
  }

  /** Update role name/description, permissions, and property/floor scope */
  async update(
    roleId: string,
    dto: { name?: string; description?: string; permissionCodes?: string[]; propertyIds?: string[]; floorNumbers?: number[] },
    updatedBy: string,
  ) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw AppError.notFound('Role');
    if (role.isSystem) throw AppError.forbidden('Cannot modify a system role');

    const propertyIds = dto.propertyIds ? await this.resolveCompanyPropertyIds(dto.propertyIds, role.companyId) : undefined;
    const floorNumbers = dto.floorNumbers ? this.normalizeFloorNumbers(dto.floorNumbers) : undefined;

    await prisma.$transaction(async (tx) => {
      if (dto.name || dto.description !== undefined) {
        await tx.role.update({
          where: { id: roleId },
          data: {
            ...(dto.name && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
          },
        });
      }

      if (dto.permissionCodes) {
        // Replace all permissions
        await tx.rolePermission.deleteMany({ where: { roleId } });

        const permissions = await tx.permission.findMany({
          where: { code: { in: dto.permissionCodes }, isActive: true },
        });

        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({
              roleId,
              permissionId: p.id,
              grantedBy: updatedBy,
            })),
          });
        }
      }

      if (propertyIds) {
        // Replace all property scope (empty array = unrestricted, all properties)
        await tx.roleProperty.deleteMany({ where: { roleId } });
        if (propertyIds.length > 0) {
          await tx.roleProperty.createMany({
            data: propertyIds.map((propertyId) => ({ roleId, propertyId })),
          });
        }
      }

      if (floorNumbers) {
        // Replace all floor scope (empty array = unrestricted, all floors)
        await tx.roleFloor.deleteMany({ where: { roleId } });
        if (floorNumbers.length > 0) {
          await tx.roleFloor.createMany({
            data: floorNumbers.map((floorNumber) => ({ roleId, floorNumber })),
          });
        }
      }
    });

    // Invalidate cache outside transaction
    if (dto.permissionCodes || propertyIds || floorNumbers) {
      await permissionResolver.invalidateCacheForRole(roleId);
    }

    return this.findById(roleId);
  }

  /** Delete a role (guard: not system, no active users) */
  async delete(roleId: string) {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!role) throw AppError.notFound('Role');
    if (role.isSystem) throw AppError.forbidden('Cannot delete a system role');
    if (role._count.userRoles > 0) {
      throw AppError.conflict(
        `Cannot delete role. ${role._count.userRoles} user(s) are assigned to this role.`,
        'ROLE_HAS_USERS',
      );
    }

    await permissionResolver.invalidateCacheForRole(roleId);
    await prisma.role.delete({ where: { id: roleId } });
  }

  /** Create role from template */
  async createFromTemplate(templateId: string, name: string, companyId: string, createdBy: string) {
    const template = await prisma.roleTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw AppError.notFound('Role template');

    return this.create(
      { name, description: template.description || undefined, permissionCodes: template.permissions },
      companyId,
      createdBy,
    );
  }

  /** List role templates */
  async getTemplates() {
    return prisma.roleTemplate.findMany({ orderBy: { name: 'asc' } });
  }
}

export const rolesService = new RolesService();
