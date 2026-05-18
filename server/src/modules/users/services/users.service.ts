import { prisma } from '../../../common/database';
import { AppError } from '../../../common/errors';
import { permissionResolver } from '../helpers/permission-resolver';

export class UsersService {
  /** List users with filters and pagination */
  async findAll(companyId: string, query: {
    search?: string; departmentId?: string; roleId?: string;
    isActive?: boolean; page?: number; limit?: number;
    sort?: string; order?: 'asc' | 'desc';
  }) {
    const { search, departmentId, roleId, isActive, page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = query;

    const where: Record<string, unknown> = { companyId, deletedAt: null };
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { profile: { firstName: { contains: search, mode: 'insensitive' } } },
        { profile: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Filter by department via profile
    const profileWhere: Record<string, unknown> = {};
    if (departmentId) profileWhere.departmentId = departmentId;

    // Filter by role via userRoles
    const userRolesWhere = roleId ? { some: { roleId } } : undefined;

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          ...where,
          ...(departmentId ? { profile: { ...profileWhere } } : {}),
          ...(roleId ? { userRoles: userRolesWhere } : {}),
        },
        include: {
          profile: { include: { department: { select: { id: true, name: true } } } },
          userRoles: { include: { role: { select: { id: true, name: true } } } },
        },
        orderBy: sort === 'fullName' ? { profile: { firstName: order } } : { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({
        where: {
          ...where,
          ...(departmentId ? { profile: { ...profileWhere } } : {}),
          ...(roleId ? { userRoles: userRolesWhere } : {}),
        },
      }),
    ]);

    return {
      data: data.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : u.email,
        jobTitle: u.profile?.jobTitle,
        avatarUrl: u.profile?.avatarUrl,
        department: u.profile?.department,
        roles: u.userRoles.map((ur) => ur.role),
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Get detailed user info with permissions */
  async findById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          include: {
            department: { select: { id: true, name: true } },
            position: { select: { id: true, name: true, level: true } },
          },
        },
        userRoles: {
          include: { role: { select: { id: true, name: true } } },
        },
        permissionOverrides: {
          include: { permission: { select: { code: true, name: true, module: true } } },
        },
      },
    });

    if (!user) throw AppError.notFound('User');

    const effectivePermissions = await permissionResolver.getEffectivePermissions(userId);

    return {
      id: user.id,
      email: user.email,
      firstName: user.profile?.firstName,
      lastName: user.profile?.lastName,
      phone: user.profile?.phone,
      mobile: user.profile?.mobile,
      avatarUrl: user.profile?.avatarUrl,
      jobTitle: user.profile?.jobTitle,
      employeeId: user.profile?.employeeId,
      dateOfJoining: user.profile?.dateOfJoining,
      timezone: user.profile?.timezone,
      locale: user.profile?.locale,
      department: user.profile?.department,
      position: user.profile?.position,
      roles: user.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        propertyId: ur.propertyId,
        expiresAt: ur.expiresAt,
      })),
      permissionOverrides: user.permissionOverrides.map((o) => ({
        id: o.id,
        permissionCode: o.permission.code,
        permissionName: o.permission.name,
        module: o.permission.module,
        overrideType: o.overrideType,
        reason: o.reason,
        expiresAt: o.expiresAt,
      })),
      effectivePermissions,
      isActive: user.isActive,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  /** Create user with profile and optional role assignment */
  async create(dto: {
    email: string; firstName: string; lastName: string; jobTitle?: string;
    departmentId?: string; positionId?: string; roleIds?: string[];
  }, companyId: string) {
    const email = dto.email.toLowerCase().trim();

    // Check uniqueness
    const existing = await prisma.user.findUnique({
      where: { uq_users_email_company: { email, companyId } },
    });
    if (existing) throw AppError.conflict('A user with this email already exists in your organization.', 'EMAIL_ALREADY_EXISTS');

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          companyId,
          email,
          mustChangePassword: true,
        },
      });

      await tx.userProfile.create({
        data: {
          userId: user.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          jobTitle: dto.jobTitle,
          departmentId: dto.departmentId,
          positionId: dto.positionId,
        },
      });

      // Assign roles
      if (dto.roleIds?.length) {
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId: user.id, roleId })),
        });
      }

      return user;
    });
  }

  /** Update user profile */
  async updateProfile(userId: string, dto: Record<string, unknown>) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: (dto.firstName as string) || '',
        lastName: (dto.lastName as string) || '',
        ...dto,
      },
      update: dto,
    });

    return this.findById(userId);
  }

  /** Deactivate user — revoke tokens, invalidate cache */
  async deactivate(userId: string, reason: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: `deactivated: ${reason}` },
    });

    await permissionResolver.invalidateCache(userId);
  }

  /** Reactivate a deactivated user */
  async reactivate(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');
    if (user.isActive) throw AppError.validation('User is already active');

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });
  }

  /** Admin resets user password — generates temporary password, forces change on next login */
  async adminResetPassword(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    // Generate a random temporary password
    const crypto = await import('crypto');
    const tempPassword = 'Tmp' + crypto.randomBytes(4).toString('hex') + '!1';

    const { passwordService } = await import('../../auth/services/password.service');
    const hash = await passwordService.hash(tempPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, mustChangePassword: true },
    });

    // Revoke all existing sessions
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'admin_password_reset' },
    });

    return { temporaryPassword: tempPassword, mustChangePassword: true };
  }

  /** Assign a role to a user */
  async assignRole(userId: string, dto: { roleId: string; propertyId?: string; expiresAt?: string }, grantedBy: string) {
    // Verify role belongs to same company
    const [user, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.role.findUnique({ where: { id: dto.roleId } }),
    ]);
    if (!user) throw AppError.notFound('User');
    if (!role) throw AppError.notFound('Role');
    if (user.companyId !== role.companyId) throw AppError.validation('Role does not belong to the same company');

    await prisma.userRole.upsert({
      where: {
        uq_user_role: {
          userId,
          roleId: dto.roleId,
        },
      },
      create: {
        userId,
        roleId: dto.roleId,
        propertyId: dto.propertyId,
        grantedBy,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      update: {
        propertyId: dto.propertyId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        grantedBy,
      },
    });

    await permissionResolver.invalidateCache(userId);
  }

  /** Remove a role from a user */
  async removeRole(userId: string, roleId: string) {
    await prisma.userRole.deleteMany({ where: { userId, roleId } });
    await permissionResolver.invalidateCache(userId);
  }

  /** Add or update a per-user permission override */
  async setPermissionOverride(userId: string, dto: {
    permissionCode: string; overrideType: 'grant' | 'revoke'; reason?: string; expiresAt?: string;
  }, grantedBy: string) {
    const perm = await prisma.permission.findUnique({ where: { code: dto.permissionCode } });
    if (!perm) throw AppError.notFound('Permission');

    await prisma.userPermissionOverride.upsert({
      where: { uq_user_perm_override: { userId, permissionId: perm.id } },
      create: {
        userId,
        permissionId: perm.id,
        overrideType: dto.overrideType,
        reason: dto.reason,
        grantedBy,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      update: {
        overrideType: dto.overrideType,
        reason: dto.reason,
        grantedBy,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    await permissionResolver.invalidateCache(userId);
  }

  /** Remove a permission override */
  async removePermissionOverride(userId: string, overrideId: string) {
    await prisma.userPermissionOverride.deleteMany({ where: { id: overrideId, userId } });
    await permissionResolver.invalidateCache(userId);
  }

  /** Get overrides for a user */
  async getPermissionOverrides(userId: string) {
    return prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: true, grantor: { include: { profile: true } } },
      orderBy: { grantedAt: 'desc' },
    });
  }
}

export const usersService = new UsersService();
