import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * System-defined permissions catalog.
 * These are seeded once and referenced by roles.
 */
const PERMISSIONS = [
  // Users module
  { code: 'users.read', name: 'View Users', module: 'users', action: 'read' },
  { code: 'users.create', name: 'Create Users', module: 'users', action: 'create' },
  { code: 'users.update', name: 'Update Users', module: 'users', action: 'update' },
  { code: 'users.delete', name: 'Delete Users', module: 'users', action: 'delete' },
  { code: 'users.invite', name: 'Invite Users', module: 'users', action: 'invite' },
  { code: 'users.deactivate', name: 'Deactivate Users', module: 'users', action: 'deactivate' },
  { code: 'users.manage-roles', name: 'Manage User Roles', module: 'users', action: 'manage' },
  { code: 'users.manage-permissions', name: 'Manage Permission Overrides', module: 'users', action: 'manage' },

  // Roles
  { code: 'roles.read', name: 'View Roles', module: 'roles', action: 'read' },
  { code: 'roles.create', name: 'Create Roles', module: 'roles', action: 'create' },
  { code: 'roles.manage', name: 'Manage Roles', module: 'roles', action: 'manage' },

  // Departments
  { code: 'departments.read', name: 'View Departments', module: 'departments', action: 'read' },
  { code: 'departments.create', name: 'Create Departments', module: 'departments', action: 'create' },
  { code: 'departments.update', name: 'Update Departments', module: 'departments', action: 'update' },
  { code: 'departments.delete', name: 'Delete Departments', module: 'departments', action: 'delete' },

  // Positions
  { code: 'positions.read', name: 'View Positions', module: 'positions', action: 'read' },
  { code: 'positions.create', name: 'Create Positions', module: 'positions', action: 'create' },
  { code: 'positions.update', name: 'Update Positions', module: 'positions', action: 'update' },
  { code: 'positions.delete', name: 'Delete Positions', module: 'positions', action: 'delete' },

  // Properties (future module 1.3)
  { code: 'properties.read', name: 'View Properties', module: 'properties', action: 'read' },
  { code: 'properties.create', name: 'Create Properties', module: 'properties', action: 'create' },
  { code: 'properties.update', name: 'Update Properties', module: 'properties', action: 'update' },
  { code: 'properties.delete', name: 'Delete Properties', module: 'properties', action: 'delete' },

  // Leasing
  { code: 'leases.read', name: 'View Leases', module: 'leases', action: 'read' },
  { code: 'leases.create', name: 'Create Leases', module: 'leases', action: 'create' },
  { code: 'leases.update', name: 'Update Leases', module: 'leases', action: 'update' },
  { code: 'leases.approve', name: 'Approve Leases', module: 'leases', action: 'approve' },
  { code: 'leases.export', name: 'Export Leases', module: 'leases', action: 'export' },

  // Billing
  { code: 'billing.read', name: 'View Billing', module: 'billing', action: 'read' },
  { code: 'billing.create', name: 'Create Invoices', module: 'billing', action: 'create' },
  { code: 'billing.update', name: 'Update Billing', module: 'billing', action: 'update' },
  { code: 'billing.approve', name: 'Approve Invoices', module: 'billing', action: 'approve' },
  { code: 'billing.export', name: 'Export Billing', module: 'billing', action: 'export' },

  // Maintenance
  { code: 'maintenance.read', name: 'View Maintenance', module: 'maintenance', action: 'read' },
  { code: 'maintenance.create', name: 'Create Work Orders', module: 'maintenance', action: 'create' },
  { code: 'maintenance.update', name: 'Update Work Orders', module: 'maintenance', action: 'update' },
  { code: 'maintenance.assign', name: 'Assign Work Orders', module: 'maintenance', action: 'assign' },
  { code: 'maintenance.approve', name: 'Approve Maintenance', module: 'maintenance', action: 'approve' },

  // Reports
  { code: 'reports.view', name: 'View Reports', module: 'reports', action: 'read' },
  { code: 'reports.financial', name: 'View Financial Reports', module: 'reports', action: 'read' },
  { code: 'reports.export', name: 'Export Reports', module: 'reports', action: 'export' },

  // Settings / Admin
  { code: 'settings.read', name: 'View Settings', module: 'settings', action: 'read' },
  { code: 'settings.manage', name: 'Manage Settings', module: 'settings', action: 'manage' },
  { code: 'audit.read', name: 'View Audit Logs', module: 'audit', action: 'read' },

  // Notifications (Module 1.5)
  { code: 'notifications.send', name: 'Send Notifications', module: 'notifications', action: 'create' },
  { code: 'notifications.logs', name: 'View Notification Logs', module: 'notifications', action: 'read' },
  { code: 'notifications.manage', name: 'Manage Notification Templates', module: 'notifications', action: 'manage' },
];

const ROLE_TEMPLATES = [
  {
    name: 'Super Admin',
    description: 'Full system access — all permissions',
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    name: 'Property Manager',
    description: 'Manage properties, leases, tenants, and maintenance',
    permissions: [
      'users.read', 'properties.read', 'properties.update',
      'leases.read', 'leases.create', 'leases.update', 'leases.approve',
      'billing.read', 'billing.create',
      'maintenance.read', 'maintenance.create', 'maintenance.update', 'maintenance.assign',
      'reports.view', 'departments.read', 'positions.read',
    ],
  },
  {
    name: 'Finance',
    description: 'Full billing, accounts, and financial reporting access',
    permissions: [
      'billing.read', 'billing.create', 'billing.update', 'billing.approve', 'billing.export',
      'reports.view', 'reports.financial', 'reports.export',
      'leases.read', 'properties.read', 'users.read',
    ],
  },
  {
    name: 'Maintenance',
    description: 'View and manage maintenance work orders',
    permissions: [
      'maintenance.read', 'maintenance.create', 'maintenance.update', 'maintenance.assign',
      'properties.read', 'users.read',
    ],
  },
  {
    name: 'Security',
    description: 'Building security operations',
    permissions: [
      'properties.read', 'users.read', 'audit.read',
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access to the system',
    permissions: [
      'users.read', 'properties.read', 'leases.read', 'billing.read',
      'maintenance.read', 'reports.view', 'departments.read', 'positions.read',
    ],
  },
];

async function seedPermissions() {
  console.log('🔐 Seeding permissions...');

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      create: perm,
      update: { name: perm.name, module: perm.module, action: perm.action },
    });
  }
  console.log(`  ✅ ${PERMISSIONS.length} permissions seeded`);
}

async function seedRoleTemplates() {
  console.log('📋 Seeding role templates...');

  for (const template of ROLE_TEMPLATES) {
    await prisma.roleTemplate.upsert({
      where: { name: template.name },
      create: template,
      update: { description: template.description, permissions: template.permissions },
    });
  }
  console.log(`  ✅ ${ROLE_TEMPLATES.length} role templates seeded`);
}

async function seedAdminRole() {
  console.log('👑 Seeding admin role...');

  const companyId = '00000000-0000-0000-0000-000000000001';

  // Create Super Admin role for the default company
  const allPerms = await prisma.permission.findMany({ where: { isActive: true } });

  const role = await prisma.role.upsert({
    where: { uq_role_name_company: { name: 'Super Admin', companyId } },
    create: {
      companyId,
      name: 'Super Admin',
      description: 'Full system access',
      isSystem: true,
    },
    update: {},
  });

  // Assign all permissions to Super Admin
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      create: { roleId: role.id, permissionId: perm.id },
      update: {},
    });
  }

  // Assign admin user to Super Admin role
  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@acmeproperty.com', companyId },
  });

  if (adminUser) {
    await prisma.userRole.upsert({
      where: { uq_user_role: { userId: adminUser.id, roleId: role.id } },
      create: { userId: adminUser.id, roleId: role.id },
      update: {},
    });

    // Create user profile
    await prisma.userProfile.upsert({
      where: { userId: adminUser.id },
      create: {
        userId: adminUser.id,
        firstName: 'System',
        lastName: 'Admin',
        jobTitle: 'System Administrator',
      },
      update: {},
    });

    console.log(`  ✅ Admin user assigned to Super Admin role (${allPerms.length} permissions)`);
  }

  // Create profile for test user too
  const testUser = await prisma.user.findFirst({
    where: { email: 'user@acmeproperty.com', companyId },
  });

  if (testUser) {
    // Create Viewer role
    const viewerRole = await prisma.role.upsert({
      where: { uq_role_name_company: { name: 'Viewer', companyId } },
      create: { companyId, name: 'Viewer', description: 'Read-only access' },
      update: {},
    });

    const viewerPerms = await prisma.permission.findMany({
      where: { code: { in: ['users.read', 'properties.read', 'departments.read', 'positions.read', 'roles.read'] } },
    });

    for (const p of viewerPerms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: viewerRole.id, permissionId: p.id } },
        create: { roleId: viewerRole.id, permissionId: p.id },
        update: {},
      });
    }

    await prisma.userRole.upsert({
      where: { uq_user_role: { userId: testUser.id, roleId: viewerRole.id } },
      create: { userId: testUser.id, roleId: viewerRole.id },
      update: {},
    });

    await prisma.userProfile.upsert({
      where: { userId: testUser.id },
      create: {
        userId: testUser.id,
        firstName: 'Test',
        lastName: 'User',
        jobTitle: 'Staff',
      },
      update: {},
    });

    console.log(`  ✅ Test user assigned to Viewer role`);
  }
}

async function seedDepartments() {
  console.log('🏢 Seeding departments...');
  const companyId = '00000000-0000-0000-0000-000000000001';

  const hq = await prisma.department.upsert({
    where: { uq_dept_code_company: { code: 'HQ', companyId } },
    create: { companyId, name: 'Head Office', code: 'HQ', sortOrder: 0 },
    update: {},
  });

  const departments = [
    { name: 'Finance', code: 'FIN', parentId: hq.id, sortOrder: 1 },
    { name: 'Operations', code: 'OPS', parentId: hq.id, sortOrder: 2 },
    { name: 'Maintenance', code: 'MNT', parentId: hq.id, sortOrder: 3 },
    { name: 'IT', code: 'IT', parentId: hq.id, sortOrder: 4 },
    { name: 'HR', code: 'HR', parentId: hq.id, sortOrder: 5 },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { uq_dept_code_company: { code: dept.code, companyId } },
      create: { companyId, ...dept },
      update: {},
    });
  }

  console.log(`  ✅ ${departments.length + 1} departments seeded`);
}

async function main() {
  console.log('\n🌱 Seeding Module 1.2 — User & Role Management...\n');
  await seedPermissions();
  await seedRoleTemplates();
  await seedAdminRole();
  await seedDepartments();
  console.log('\n🎉 Module 1.2 seed complete!\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
