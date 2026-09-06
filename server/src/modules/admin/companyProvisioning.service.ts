import { prisma, setTenantContext } from '../../common/database';
import { companiesService } from '../organization/services/companies.service';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Default role templates for new companies.
 * Maps role name → permission codes.
 * Super Admin gets ALL permissions automatically.
 */
const DEFAULT_ROLES: Record<string, { description: string; permissions: string[] }> = {
  'Property Manager': {
    description: 'Manage properties, leases, tenants, and maintenance',
    permissions: [
      'users.read', 'properties.read', 'properties.update',
      'tenants.read', 'tenants.create', 'tenants.update', 'tenants.blacklist', 'tenants.kyc',
      'leases.read', 'leases.create', 'leases.update', 'leases.approve', 'leases.terminate',
      'billing-dashboard.read', 'billing-invoices.read', 'billing-invoices.write',
      'documents.read', 'documents.write',
      'departments.read', 'positions.read', 'reports-executive.read',
    ],
  },
  'Finance': {
    description: 'Full billing, accounts, and financial reporting access',
    permissions: [
      'billing-dashboard.read', 'billing-invoices.read', 'billing-invoices.write',
      'billing-schedules.read', 'billing-charge-types.read', 'billing-settings.read',
      'reports-executive.read', 'reports-bi.read',
      'leases.read', 'properties.read', 'users.read', 'tenants.read',
    ],
  },
  'Maintenance': {
    description: 'View and manage maintenance work orders',
    permissions: ['properties.read', 'users.read'],
  },
  'Viewer': {
    description: 'Read-only access to the system',
    permissions: [
      'users.read', 'properties.read', 'tenants.read', 'leases.read', 'billing-dashboard.read',
      'reports-executive.read', 'departments.read', 'positions.read', 'documents.read',
    ],
  },
};

const DEFAULT_DEPARTMENTS = [
  { name: 'Head Office', code: 'HQ', sortOrder: 0 },
  { name: 'Finance', code: 'FIN', sortOrder: 1 },
  { name: 'Operations', code: 'OPS', sortOrder: 2 },
  { name: 'Maintenance', code: 'MNT', sortOrder: 3 },
  { name: 'IT', code: 'IT', sortOrder: 4 },
  { name: 'HR', code: 'HR', sortOrder: 5 },
];

interface ProvisionDto {
  name: string;
  legalName?: string;
  companyType?: string;
  country: string;
  currency: string;
  timezone: string;
  email?: string;
  phone?: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
}

interface ProvisionResult {
  company: { id: string; code: string; name: string };
  admin: { id: string; email: string; temporaryPassword: string };
  summary: {
    rolesCreated: number;
    departmentsCreated: number;
  };
}

/**
 * Generate a secure temporary password.
 * Format: 2 uppercase + 4 lowercase + 2 digits + 1 special + 3 random
 */
function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '@#$!&';
  const all = upper + lower + digits + special;

  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join('');

  const parts = [pick(upper, 2), pick(lower, 4), pick(digits, 2), pick(special, 1), pick(all, 3)];
  // Shuffle
  return parts.join('').split('').sort(() => crypto.randomInt(3) - 1).join('');
}

export class CompanyProvisioningService {
  /**
   * Provision a fully bootstrapped company with:
   * - Company record + auto-generated code
   * - Super Admin role + all permissions
   * - Default roles (Property Manager, Finance, etc.)
   * - Default departments
   * - Password policy
   * - First admin user with temporary password
   */
  async provision(dto: ProvisionDto): Promise<ProvisionResult> {
    // Validate admin email doesn't already exist globally
    const existingUser = await prisma.user.findFirst({
      where: { email: dto.adminEmail.toLowerCase().trim() },
    });
    // Note: with RLS active, this only finds users if tenant context is set.
    // Since we're called from an authenticated admin, their tenant context is set.
    // We need to check across all companies, so we do a raw query.
    const existingAcrossCompanies = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM users WHERE email = ${dto.adminEmail.toLowerCase().trim()} AND deleted_at IS NULL
    `;
    if (existingAcrossCompanies[0]?.count > 0) {
      throw AppError.conflict('A user with this email already exists in another company');
    }

    // Generate company code
    const code = await companiesService.generateCode(dto.name);

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    // All in a transaction (using superuser-level context since we're creating cross-company data)
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create company
      const company = await tx.company.create({
        data: {
          name: dto.name,
          code,
          legalName: dto.legalName || dto.name,
          companyType: dto.companyType || 'standalone',
          country: dto.country,
          currency: dto.currency,
          timezone: dto.timezone,
          email: dto.email || dto.adminEmail,
          phone: dto.phone,
          isActive: true,
          settings: {
            mallModuleEnabled: false,
            condoModuleEnabled: true,
            maxProperties: 50,
            subscriptionPlan: 'standard',
          },
        },
      });

      // Set tenant context for the new company so RLS allows inserts
      await tx.$executeRawUnsafe(`SET LOCAL app.current_company_id = '${company.id}'`);

      // 2. Create password policy
      await tx.passwordPolicy.create({
        data: {
          companyId: company.id,
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumber: true,
          requireSpecial: true,
          maxAgeDays: 90,
          historyCount: 5,
          maxFailedAttempts: 5,
          lockoutDurationMins: 30,
          sessionTimeoutMins: 480,
          mfaRequired: false,
        },
      });

      // 3. Create Super Admin role with ALL permissions
      const allPermissions = await tx.permission.findMany({ where: { isActive: true } });

      const superAdminRole = await tx.role.create({
        data: {
          companyId: company.id,
          name: 'Super Admin',
          description: 'Full system access — all permissions',
          isSystem: true,
        },
      });

      for (const perm of allPermissions) {
        await tx.rolePermission.create({
          data: { roleId: superAdminRole.id, permissionId: perm.id },
        });
      }

      // 4. Create default roles
      let rolesCreated = 1; // Super Admin already counted
      for (const [roleName, config] of Object.entries(DEFAULT_ROLES)) {
        const role = await tx.role.create({
          data: {
            companyId: company.id,
            name: roleName,
            description: config.description,
          },
        });

        // Find permissions by code and assign
        const perms = allPermissions.filter((p) => config.permissions.includes(p.code));
        for (const perm of perms) {
          await tx.rolePermission.create({
            data: { roleId: role.id, permissionId: perm.id },
          });
        }
        rolesCreated++;
      }

      // 5. Create default departments
      const hqDept = DEFAULT_DEPARTMENTS[0];
      const hq = await tx.department.create({
        data: {
          companyId: company.id,
          name: hqDept.name,
          code: hqDept.code,
          sortOrder: hqDept.sortOrder,
        },
      });

      for (const dept of DEFAULT_DEPARTMENTS.slice(1)) {
        await tx.department.create({
          data: {
            companyId: company.id,
            name: dept.name,
            code: dept.code,
            sortOrder: dept.sortOrder,
            parentId: hq.id,
          },
        });
      }

      // 6. Create admin user
      const adminUser = await tx.user.create({
        data: {
          companyId: company.id,
          email: dto.adminEmail.toLowerCase().trim(),
          emailVerified: true,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
        },
      });

      // Assign Super Admin role
      await tx.userRole.create({
        data: { userId: adminUser.id, roleId: superAdminRole.id },
      });

      // Create user profile
      await tx.userProfile.create({
        data: {
          userId: adminUser.id,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          jobTitle: 'Administrator',
        },
      });

      return {
        company: { id: company.id, code: company.code!, name: company.name },
        admin: { id: adminUser.id, email: adminUser.email, temporaryPassword },
        summary: {
          rolesCreated,
          departmentsCreated: DEFAULT_DEPARTMENTS.length,
        },
      };
    });

    logger.info(`Company provisioned: ${result.company.code} (${result.company.name})`);
    return result;
  }

  /**
   * List all companies (system admin view).
   * This bypasses RLS since it queries the companies table (not RLS-protected).
   */
  async listCompanies() {
    return prisma.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        companyType: true,
        country: true,
        currency: true,
        timezone: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: { users: true, properties: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Deactivate a company (soft disable — users can't login).
   */
  async deactivateCompany(companyId: string) {
    return prisma.company.update({
      where: { id: companyId },
      data: { isActive: false },
    });
  }

  /**
   * Reactivate a company.
   */
  async activateCompany(companyId: string) {
    return prisma.company.update({
      where: { id: companyId },
      data: { isActive: true },
    });
  }
}

export const companyProvisioningService = new CompanyProvisioningService();
