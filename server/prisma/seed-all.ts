import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const d = (s: string) => new Date(s);
const dec = (n: string) => new Prisma.Decimal(n);

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  PMS — Full Seed (Phase 1 + Phase 2)');
  console.log('═══════════════════════════════════════\n');

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 1.1 — Company + Users + Auth         ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 1.1 — Company, Users, Auth');

  const company = await prisma.company.upsert({
    where: { id: COMPANY_ID },
    create: {
      id: COMPANY_ID, code: 'ACME', name: 'ACME Property Group', legalName: 'ACME Property Group Pte Ltd',
      companyType: 'standalone', registrationNo: 'REG-2018-NY-00412', taxId: 'US-EIN-82-1234567',
      industry: 'Real Estate Management', phone: '+1-212-555-1000',
      email: 'admin@acmeproperty.com', website: 'https://acmeproperty.com',
      addressLine1: '350 Fifth Avenue, Suite 4200', addressLine2: 'Empire State Building',
      city: 'New York', state: 'NY', postalCode: '10118', country: 'US',
      currency: 'USD', timezone: 'America/New_York',
      settings: { mallModuleEnabled: false, condoModuleEnabled: true, maxProperties: 50, subscriptionPlan: 'enterprise', fiscalYearStart: '01-01' },
    },
    update: {
      code: 'ACME',
      legalName: 'ACME Property Group Pte Ltd', registrationNo: 'REG-2018-NY-00412', taxId: 'US-EIN-82-1234567',
      industry: 'Real Estate Management', phone: '+1-212-555-1000', website: 'https://acmeproperty.com',
      addressLine1: '350 Fifth Avenue, Suite 4200', addressLine2: 'Empire State Building',
      city: 'New York', state: 'NY', postalCode: '10118',
    },
  });

  await prisma.passwordPolicy.upsert({
    where: { companyId: COMPANY_ID },
    create: {
      companyId: COMPANY_ID, minLength: 8, requireUppercase: true, requireLowercase: true,
      requireNumber: true, requireSpecial: true, maxAgeDays: 90, historyCount: 5,
      maxFailedAttempts: 5, lockoutDurationMins: 30, sessionTimeoutMins: 480, mfaRequired: false,
    },
    update: {},
  });

  const pwHash = await bcrypt.hash('Admin@123', 12);
  const userHash = await bcrypt.hash('User@123', 12);

  const admin = await prisma.user.upsert({
    where: { uq_users_email_company: { email: 'admin@acmeproperty.com', companyId: COMPANY_ID } },
    create: { companyId: COMPANY_ID, email: 'admin@acmeproperty.com', emailVerified: true, passwordHash: pwHash, isActive: true, mustChangePassword: false },
    update: {},
  });

  const agent1 = await prisma.user.upsert({
    where: { uq_users_email_company: { email: 'agent1@acmeproperty.com', companyId: COMPANY_ID } },
    create: { companyId: COMPANY_ID, email: 'agent1@acmeproperty.com', emailVerified: true, passwordHash: userHash, isActive: true, mustChangePassword: false },
    update: {},
  });

  const agent2 = await prisma.user.upsert({
    where: { uq_users_email_company: { email: 'agent2@acmeproperty.com', companyId: COMPANY_ID } },
    create: { companyId: COMPANY_ID, email: 'agent2@acmeproperty.com', emailVerified: true, passwordHash: userHash, isActive: true, mustChangePassword: false },
    update: {},
  });

  // Create profiles
  for (const [user, fn, ln] of [
    [admin, 'Admin', 'User'],
    [agent1, 'Rachel', 'Tan'],
    [agent2, 'Mark', 'Johnson'],
  ]) {
    await prisma.userProfile.upsert({
      where: { userId: (user as any).id },
      create: { userId: (user as any).id, firstName: fn as string, lastName: ln as string },
      update: {},
    });
  }

  console.log('  ✅ Company, 3 users (admin + 2 agents), profiles');
  console.log('     admin@acmeproperty.com / Admin@123');
  console.log('     agent1@acmeproperty.com / User@123');
  console.log('     agent2@acmeproperty.com / User@123');

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 1.2 — Permissions, Roles, Departments ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 1.2 — Permissions, Roles, Departments');

  const PERMISSIONS = [
    { code: 'users.read', name: 'View Users', module: 'users', action: 'read' },
    { code: 'users.create', name: 'Create Users', module: 'users', action: 'create' },
    { code: 'users.update', name: 'Update Users', module: 'users', action: 'update' },
    { code: 'users.delete', name: 'Delete Users', module: 'users', action: 'delete' },
    { code: 'users.invite', name: 'Invite Users', module: 'users', action: 'invite' },
    { code: 'users.deactivate', name: 'Deactivate', module: 'users', action: 'deactivate' },
    { code: 'users.manage-roles', name: 'Manage User Roles', module: 'users', action: 'manage' },
    { code: 'users.manage-permissions', name: 'Manage Overrides', module: 'users', action: 'manage' },
    { code: 'roles.read', name: 'View Roles', module: 'roles', action: 'read' },
    { code: 'roles.create', name: 'Create Roles', module: 'roles', action: 'create' },
    { code: 'roles.manage', name: 'Manage Roles', module: 'roles', action: 'manage' },
    { code: 'departments.read', name: 'View Departments', module: 'departments', action: 'read' },
    { code: 'departments.create', name: 'Create Departments', module: 'departments', action: 'create' },
    { code: 'departments.update', name: 'Update Departments', module: 'departments', action: 'update' },
    { code: 'departments.delete', name: 'Delete Departments', module: 'departments', action: 'delete' },
    { code: 'positions.read', name: 'View Positions', module: 'positions', action: 'read' },
    { code: 'positions.create', name: 'Create Positions', module: 'positions', action: 'create' },
    { code: 'positions.update', name: 'Update Positions', module: 'positions', action: 'update' },
    { code: 'positions.delete', name: 'Delete Positions', module: 'positions', action: 'delete' },
    { code: 'properties.read', name: 'View Properties', module: 'properties', action: 'read' },
    { code: 'properties.create', name: 'Create Properties', module: 'properties', action: 'create' },
    { code: 'properties.update', name: 'Update Properties', module: 'properties', action: 'update' },
    { code: 'properties.delete', name: 'Delete Properties', module: 'properties', action: 'delete' },
    { code: 'tenants.read', name: 'View Tenants', module: 'tenants', action: 'read' },
    { code: 'tenants.create', name: 'Create Tenants', module: 'tenants', action: 'create' },
    { code: 'tenants.update', name: 'Update Tenants', module: 'tenants', action: 'update' },
    { code: 'tenants.delete', name: 'Delete Tenants', module: 'tenants', action: 'delete' },
    { code: 'tenants.blacklist', name: 'Blacklist Tenants', module: 'tenants', action: 'manage' },
    { code: 'tenants.kyc', name: 'Manage Tenant KYC', module: 'tenants', action: 'manage' },
    { code: 'leases.read', name: 'View Leases', module: 'leases', action: 'read' },
    { code: 'leases.create', name: 'Create Leases', module: 'leases', action: 'create' },
    { code: 'leases.update', name: 'Update Leases', module: 'leases', action: 'update' },
    { code: 'leases.approve', name: 'Approve Leases', module: 'leases', action: 'approve' },
    { code: 'leases.terminate', name: 'Terminate Leases', module: 'leases', action: 'manage' },
    { code: 'leases.export', name: 'Export Leases', module: 'leases', action: 'export' },
    { code: 'billing.read', name: 'View Billing', module: 'billing', action: 'read' },
    { code: 'billing.create', name: 'Create Invoices', module: 'billing', action: 'create' },
    { code: 'reports.view', name: 'View Reports', module: 'reports', action: 'read' },
    { code: 'settings.read', name: 'View Settings', module: 'settings', action: 'read' },
    { code: 'settings.manage', name: 'Manage Settings', module: 'settings', action: 'manage' },
    { code: 'audit.read', name: 'View Audit Logs', module: 'audit', action: 'read' },
    { code: 'notifications.send', name: 'Send Notifications', module: 'notifications', action: 'create' },
    { code: 'notifications.logs', name: 'View Notification Logs', module: 'notifications', action: 'read' },
    { code: 'notifications.manage', name: 'Manage Templates', module: 'notifications', action: 'manage' },
    { code: 'documents.read', name: 'View Documents', module: 'documents', action: 'read' },
    { code: 'documents.write', name: 'Manage Documents', module: 'documents', action: 'write' },
    { code: 'workflows.read', name: 'View Workflows', module: 'workflows', action: 'read' },
    { code: 'workflows.write', name: 'Manage Workflows', module: 'workflows', action: 'write' },
    { code: 'crm.read', name: 'View CRM', module: 'crm', action: 'read' },
    { code: 'crm.write', name: 'Manage CRM', module: 'crm', action: 'write' },
    { code: 'parking.read', name: 'View Parking', module: 'parking', action: 'read' },
    { code: 'parking.write', name: 'Manage Parking', module: 'parking', action: 'write' },
  ];

  const permRecords: any[] = [];
  for (const perm of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { code: perm.code }, create: perm,
      update: { name: perm.name, module: perm.module, action: perm.action },
    });
    permRecords.push(p);
  }
  console.log('  \u2705 ' + permRecords.length + ' permissions');

  // Role Templates
  for (const t of [
    { name: 'Super Admin', description: 'Full system access', permissions: PERMISSIONS.map(p => p.code) },
    { name: 'Viewer', description: 'Read-only access', permissions: ['users.read','properties.read','tenants.read','leases.read','departments.read'] },
  ]) {
    await prisma.roleTemplate.upsert({ where: { name: t.name }, create: t, update: {} });
  }

  // Super Admin role + ALL permissions
  const adminRole = await prisma.role.upsert({
    where: { uq_role_name_company: { name: 'Super Admin', companyId: COMPANY_ID } },
    create: { companyId: COMPANY_ID, name: 'Super Admin', description: 'Full system access', isSystem: true, createdBy: admin.id },
    update: {},
  });
  for (const p of permRecords) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
      create: { roleId: adminRole.id, permissionId: p.id, grantedBy: admin.id }, update: {},
    });
  }

  // Leasing Agent role + subset
  const agentRole = await prisma.role.upsert({
    where: { uq_role_name_company: { name: 'Leasing Agent', companyId: COMPANY_ID } },
    create: { companyId: COMPANY_ID, name: 'Leasing Agent', description: 'Property and leasing', isSystem: false, createdBy: admin.id },
    update: {},
  });
  const agentCodes = ['properties.read','tenants.read','tenants.create','tenants.update','leases.read','leases.create','leases.update','departments.read','positions.read','users.read','roles.read','crm.read','crm.write','parking.read','documents.read','documents.write'];
  for (const p of permRecords.filter((pr: any) => agentCodes.includes(pr.code))) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: agentRole.id, permissionId: p.id } },
      create: { roleId: agentRole.id, permissionId: p.id, grantedBy: admin.id }, update: {},
    });
  }

  // User-Role assignments
  for (const [userId, roleId] of [[admin.id, adminRole.id], [agent1.id, agentRole.id], [agent2.id, agentRole.id]]) {
    await prisma.userRole.upsert({
      where: { uq_user_role: { userId, roleId } },
      create: { userId, roleId, grantedBy: admin.id }, update: {},
    });
  }
  console.log('  \u2705 Super Admin (' + permRecords.length + ' perms), Leasing Agent (' + agentCodes.length + ' perms), 3 assignments');

  // Departments
  const hq = await prisma.department.upsert({
    where: { uq_dept_code_company: { code: 'HQ', companyId: COMPANY_ID } },
    create: { companyId: COMPANY_ID, name: 'Head Office', code: 'HQ', sortOrder: 0 }, update: {},
  });
  for (const dept of [
    { name: 'Finance', code: 'FIN', parentId: hq.id, sortOrder: 1 },
    { name: 'Operations', code: 'OPS', parentId: hq.id, sortOrder: 2 },
    { name: 'Maintenance', code: 'MNT', parentId: hq.id, sortOrder: 3 },
    { name: 'IT', code: 'IT', parentId: hq.id, sortOrder: 4 },
    { name: 'HR', code: 'HR', parentId: hq.id, sortOrder: 5 },
    { name: 'Leasing', code: 'LSG', parentId: hq.id, sortOrder: 6 },
  ]) {
    await prisma.department.upsert({
      where: { uq_dept_code_company: { code: dept.code, companyId: COMPANY_ID } },
      create: { companyId: COMPANY_ID, ...dept }, update: {},
    });
  }
  console.log('  \u2705 7 departments');

  // Flush Redis permission cache
  try {
    const Redis = (await import('ioredis')).default;
    const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const keys = await r.keys('perms:*');
    if (keys.length) await r.del(...keys);
    await r.quit();
    console.log('  \u2705 Permission cache cleared');
  } catch { console.log('  \u26a0\ufe0f  Redis cache flush skipped'); }

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 1.3 — Branches, Regions, BUs, Positions║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 1.3 — Branches, Regions, Business Units, Positions');

  // ── Branches ──
  const branchData = [
    { name: 'Head Office — Manhattan', code: 'HQ-NYC', phone: '+1-212-555-1000', email: 'hq@acmeproperty.com', addressLine1: '350 Fifth Avenue, Suite 4200', city: 'New York', state: 'NY', postalCode: '10118', country: 'US' as const, managerId: admin.id },
    { name: 'Brooklyn Operations', code: 'BRK', phone: '+1-718-555-2000', email: 'brooklyn@acmeproperty.com', addressLine1: '123 Atlantic Avenue', city: 'Brooklyn', state: 'NY', postalCode: '11217', country: 'US' as const, managerId: agent1.id },
    { name: 'Downtown Financial', code: 'FIN-DT', phone: '+1-212-555-3000', email: 'downtown@acmeproperty.com', addressLine1: '88 Financial Street', city: 'New York', state: 'NY', postalCode: '10005', country: 'US' as const, managerId: agent2.id },
  ];

  const branches: any[] = [];
  for (const b of branchData) {
    const branch = await prisma.branch.upsert({
      where: { uq_branch_code_company: { code: b.code, companyId: COMPANY_ID } },
      create: { companyId: COMPANY_ID, ...b }, update: {},
    });
    branches.push(branch);
  }
  console.log('  \u2705 ' + branches.length + ' branches');

  // ── Regions ──
  const regionData = [
    { name: 'Manhattan & Midtown', code: 'MAN', description: 'Central Manhattan properties including Midtown, Financial District, and Upper East Side', managerId: admin.id },
    { name: 'Brooklyn & Queens', code: 'BKQ', description: 'Residential and mixed-use properties across Brooklyn and Queens boroughs', managerId: agent1.id },
    { name: 'New Jersey Metro', code: 'NJM', description: 'Properties in Jersey City, Hoboken, and Newark metro area', managerId: agent2.id },
    { name: 'Long Island', code: 'LI', description: 'Suburban properties across Nassau and Suffolk counties', managerId: null },
  ];

  const regions: any[] = [];
  for (const rg of regionData) {
    const region = await prisma.region.upsert({
      where: { uq_region_code_company: { code: rg.code, companyId: COMPANY_ID } },
      create: { companyId: COMPANY_ID, ...rg }, update: {},
    });
    regions.push(region);
  }
  console.log('  \u2705 ' + regions.length + ' regions');

  // ── Business Units ──
  const buData = [
    { name: 'Residential Leasing', code: 'RES-LSG', branchIdx: 0, managerId: agent1.id },
    { name: 'Commercial Leasing', code: 'COM-LSG', branchIdx: 2, managerId: agent2.id },
    { name: 'Retail & Mixed-Use', code: 'RTL-MIX', branchIdx: 1, managerId: agent1.id },
    { name: 'Property Maintenance', code: 'MAINT', branchIdx: 0, managerId: null },
    { name: 'Asset Management', code: 'ASSET', branchIdx: 0, managerId: admin.id },
  ];

  const busUnits: any[] = [];
  for (const bu of buData) {
    const unit = await prisma.businessUnit.upsert({
      where: { uq_bu_code_company: { code: bu.code, companyId: COMPANY_ID } },
      create: { companyId: COMPANY_ID, name: bu.name, code: bu.code, branchId: branches[bu.branchIdx].id, managerId: bu.managerId }, update: {},
    });
    busUnits.push(unit);
  }
  console.log('  \u2705 ' + busUnits.length + ' business units');

  // ── Positions ──
  const posData = [
    { name: 'Chief Executive Officer', level: 10, canApprove: true, approvalLimit: dec('1000000'), deptCode: 'HQ' },
    { name: 'Chief Operating Officer', level: 9, canApprove: true, approvalLimit: dec('500000'), deptCode: 'HQ' },
    { name: 'VP of Leasing', level: 8, canApprove: true, approvalLimit: dec('200000'), deptCode: 'LSG' },
    { name: 'Finance Director', level: 8, canApprove: true, approvalLimit: dec('250000'), deptCode: 'FIN' },
    { name: 'Property Manager', level: 6, canApprove: true, approvalLimit: dec('50000'), deptCode: 'OPS' },
    { name: 'Senior Leasing Agent', level: 5, canApprove: true, approvalLimit: dec('25000'), deptCode: 'LSG' },
    { name: 'Leasing Agent', level: 4, canApprove: false, approvalLimit: null, deptCode: 'LSG' },
    { name: 'Maintenance Supervisor', level: 5, canApprove: true, approvalLimit: dec('10000'), deptCode: 'MNT' },
    { name: 'Maintenance Technician', level: 3, canApprove: false, approvalLimit: null, deptCode: 'MNT' },
    { name: 'Accountant', level: 4, canApprove: false, approvalLimit: null, deptCode: 'FIN' },
    { name: 'IT Administrator', level: 5, canApprove: true, approvalLimit: dec('15000'), deptCode: 'IT' },
    { name: 'Security Officer', level: 3, canApprove: false, approvalLimit: null, deptCode: 'OPS' },
    { name: 'Front Desk / Receptionist', level: 2, canApprove: false, approvalLimit: null, deptCode: 'OPS' },
    { name: 'HR Manager', level: 7, canApprove: true, approvalLimit: dec('50000'), deptCode: 'HR' },
  ];

  // Lookup departments for position assignment
  const allDepts = await prisma.department.findMany({ where: { companyId: COMPANY_ID } });
  const deptMap = Object.fromEntries(allDepts.map(d2 => [d2.code, d2.id]));

  for (const pos of posData) {
    await prisma.position.create({
      data: {
        companyId: COMPANY_ID, name: pos.name, level: pos.level,
        canApprove: pos.canApprove, approvalLimit: pos.approvalLimit,
        departmentId: deptMap[pos.deptCode] || null,
      },
    }).catch(() => {}); // skip duplicates
  }
  console.log('  \u2705 ' + posData.length + ' positions');

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 2.1 — Properties                     ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 2.1 — Properties');

  const propData = [
    {
      name: 'Marina Bay Residences', code: 'MBR', propertyType: 'residential',
      addressLine1: '1 Marina Boulevard', city: 'New York', state: 'NY', postalCode: '10004', country: 'US',
      totalFloors: 25, totalUnits: 120, yearBuilt: 2018,
      description: 'Premium waterfront residential complex with panoramic city views, featuring pools, gym, and concierge services.',
      coverImageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=500&fit=crop',
      branchIdx: 0, buIdx: 0, regionIdx: 0,
    },
    {
      name: 'Central Business Tower', code: 'CBT', propertyType: 'commercial',
      addressLine1: '88 Financial Street', city: 'New York', state: 'NY', postalCode: '10005', country: 'US',
      totalFloors: 40, totalUnits: 200, yearBuilt: 2020,
      description: 'Grade A office tower in the financial district with high-speed elevators and conference center.',
      coverImageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=500&fit=crop',
      branchIdx: 2, buIdx: 1, regionIdx: 0,
    },
    {
      name: 'Sunset Mall', code: 'SM', propertyType: 'mixed_use',
      addressLine1: '330 West Broadway', city: 'New York', state: 'NY', postalCode: '10013', country: 'US',
      totalFloors: 5, totalUnits: 60, yearBuilt: 2015,
      description: 'Vibrant mixed-use development with retail, F&B, and office spaces.',
      coverImageUrl: 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=800&h=500&fit=crop',
      branchIdx: 1, buIdx: 2, regionIdx: 1,
    },
    // ── 3 NEW SHOPPING MALLS ──
    {
      name: 'Grand Central Mall', code: 'GCM', propertyType: 'retail',
      addressLine1: '500 Lexington Avenue', city: 'New York', state: 'NY', postalCode: '10017', country: 'US',
      totalFloors: 8, totalUnits: 800, yearBuilt: 2022,
      description: 'Flagship luxury shopping destination spanning 8 floors with over 800 retail units, food court, cinema, and rooftop entertainment. Features anchor tenants, boutique galleries, and a grand atrium with a glass ceiling.',
      coverImageUrl: 'https://images.unsplash.com/photo-1519566335946-e6f65f0f4fdf?w=800&h=500&fit=crop',
      branchIdx: 0, buIdx: 2, regionIdx: 0,
    },
    {
      name: 'Brooklyn Galleria', code: 'BKG', propertyType: 'retail',
      addressLine1: '200 Atlantic Avenue', city: 'Brooklyn', state: 'NY', postalCode: '11201', country: 'US',
      totalFloors: 6, totalUnits: 850, yearBuilt: 2019,
      description: 'Brooklyn\'s premier lifestyle mall with 850 retail and F&B units across 6 floors. Features an indoor ice rink, luxury cinema, artisan food hall, and curated local designer boutiques.',
      coverImageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=500&fit=crop',
      branchIdx: 1, buIdx: 2, regionIdx: 1,
    },
    {
      name: 'Midtown Plaza', code: 'MTP', propertyType: 'retail',
      addressLine1: '777 Seventh Avenue', city: 'New York', state: 'NY', postalCode: '10019', country: 'US',
      totalFloors: 10, totalUnits: 1000, yearBuilt: 2023,
      description: 'The newest mega-mall in Midtown with 1,000 units across 10 floors including 2 basement levels. Features flagship stores, gourmet dining, entertainment zone with VR arcade, and a sky garden with observation deck.',
      coverImageUrl: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&h=500&fit=crop',
      branchIdx: 0, buIdx: 2, regionIdx: 0,
    },
  ];

  const properties: any[] = [];
  for (const p of propData) {
    const { branchIdx, buIdx, regionIdx, ...pFields } = p;
    const prop = await prisma.property.upsert({
      where: { uq_property_code_company: { code: p.code, companyId: COMPANY_ID } },
      create: { ...pFields, companyId: COMPANY_ID, status: 'active', branchId: branches[branchIdx].id, businessUnitId: busUnits[buIdx].id },
      update: { branchId: branches[branchIdx].id, businessUnitId: busUnits[buIdx].id, coverImageUrl: p.coverImageUrl },
    });
    properties.push(prop);

    // Region-Property mapping
    await prisma.regionProperty.upsert({
      where: { regionId_propertyId: { regionId: regions[regionIdx].id, propertyId: prop.id } },
      create: { regionId: regions[regionIdx].id, propertyId: prop.id }, update: {},
    });
  }
  console.log(`  ✅ ${properties.length} properties (linked to branches, BUs, regions)`);

  // Property Contacts
  const contactData = [
    { propIdx: 0, role: 'building_manager', name: 'James Rodriguez', phone: '+1-212-555-1101', mobile: '+1-917-555-1102', email: 'j.rodriguez@acmeproperty.com', isPrimary: true },
    { propIdx: 0, role: 'security', name: 'Mike Chen', phone: '+1-212-555-1103', mobile: '+1-917-555-1104', email: 'security.mbr@acmeproperty.com', isPrimary: false },
    { propIdx: 0, role: 'maintenance', name: 'Tony Alvarez', phone: '+1-212-555-1105', mobile: '+1-917-555-1106', email: 'maintenance.mbr@acmeproperty.com', isPrimary: false },
    { propIdx: 1, role: 'building_manager', name: 'Sarah Kim', phone: '+1-212-555-3101', mobile: '+1-917-555-3102', email: 's.kim@acmeproperty.com', isPrimary: true },
    { propIdx: 1, role: 'security', name: 'David Brown', phone: '+1-212-555-3103', mobile: '+1-917-555-3104', email: 'security.cbt@acmeproperty.com', isPrimary: false },
    { propIdx: 1, role: 'emergency', name: '24/7 Emergency Line', phone: '+1-212-555-9911', mobile: null, email: 'emergency@acmeproperty.com', isPrimary: false },
    { propIdx: 2, role: 'building_manager', name: 'Linda Patel', phone: '+1-718-555-2101', mobile: '+1-917-555-2102', email: 'l.patel@acmeproperty.com', isPrimary: true },
    { propIdx: 2, role: 'maintenance', name: 'Carlos Fernandez', phone: '+1-718-555-2103', mobile: '+1-917-555-2104', email: 'maintenance.sm@acmeproperty.com', isPrimary: false },
    // Mall contacts
    { propIdx: 3, role: 'building_manager', name: 'Richard Hayes', phone: '+1-212-555-5001', mobile: '+1-917-555-5002', email: 'r.hayes@acmeproperty.com', isPrimary: true },
    { propIdx: 3, role: 'security', name: 'GCM Security Ops', phone: '+1-212-555-5003', mobile: null, email: 'security.gcm@acmeproperty.com', isPrimary: false },
    { propIdx: 4, role: 'building_manager', name: 'Amanda Torres', phone: '+1-718-555-6001', mobile: '+1-917-555-6002', email: 'a.torres@acmeproperty.com', isPrimary: true },
    { propIdx: 4, role: 'maintenance', name: 'BKG Maintenance Team', phone: '+1-718-555-6003', mobile: null, email: 'maintenance.bkg@acmeproperty.com', isPrimary: false },
    { propIdx: 5, role: 'building_manager', name: 'Jonathan Park', phone: '+1-212-555-7001', mobile: '+1-917-555-7002', email: 'j.park@acmeproperty.com', isPrimary: true },
    { propIdx: 5, role: 'emergency', name: 'MTP Emergency', phone: '+1-212-555-7911', mobile: null, email: 'emergency.mtp@acmeproperty.com', isPrimary: false },
  ];
  for (const c of contactData) {
    const { propIdx, ...cFields } = c;
    await prisma.propertyContact.create({ data: { propertyId: properties[propIdx].id, ...cFields, sortOrder: c.isPrimary ? 0 : 1 } }).catch(() => {});
  }
  console.log('  ✅ ' + contactData.length + ' property contacts');

  // Property Facilities — seed facility types first since they're normally seeded at server start
  const FACILITY_TYPES = [
    { code: 'swimming_pool', name: 'Swimming Pool', icon: 'waves', category: 'recreation' },
    { code: 'gym', name: 'Gymnasium', icon: 'dumbbell', category: 'recreation' },
    { code: 'bbq_area', name: 'BBQ Area', icon: 'flame', category: 'recreation' },
    { code: 'playground', name: 'Playground', icon: 'playground', category: 'recreation' },
    { code: 'rooftop_garden', name: 'Rooftop Garden', icon: 'leaf', category: 'recreation' },
    { code: 'concierge', name: 'Concierge', icon: 'user-check', category: 'convenience' },
    { code: 'meeting_room', name: 'Meeting Room', icon: 'users', category: 'convenience' },
    { code: 'coworking_space', name: 'Co-working Space', icon: 'monitor', category: 'convenience' },
    { code: 'mailroom', name: 'Mailroom', icon: 'mail', category: 'convenience' },
    { code: 'laundry', name: 'Laundry', icon: 'wind', category: 'convenience' },
    { code: 'cctv', name: 'CCTV Surveillance', icon: 'camera', category: 'security' },
    { code: 'access_control', name: 'Access Control', icon: 'key', category: 'security' },
    { code: 'guard_post', name: '24/7 Guard Post', icon: 'shield', category: 'security' },
    { code: 'parking', name: 'Parking', icon: 'car', category: 'utility' },
    { code: 'ev_charging', name: 'EV Charging', icon: 'zap', category: 'utility' },
    { code: 'elevator', name: 'Elevator / Lift', icon: 'arrow-up', category: 'utility' },
    { code: 'backup_power', name: 'Backup Power', icon: 'battery', category: 'utility' },
  ];
  for (const ft of FACILITY_TYPES) {
    await prisma.facilityType.upsert({ where: { code: ft.code }, create: ft, update: {} });
  }

  const facilityTypes = await prisma.facilityType.findMany({ where: { isActive: true } });
  const ftMap = Object.fromEntries(facilityTypes.map(ft => [ft.code, ft.id]));

  const facilityData = [
    { propIdx: 0, ftCode: 'swimming_pool', name: 'Rooftop Infinity Pool', floor: '25', capacity: 40, isBookable: true },
    { propIdx: 0, ftCode: 'gym', name: 'Fitness Center', floor: '2', capacity: 30, isBookable: false },
    { propIdx: 0, ftCode: 'playground', name: 'Children\'s Playground', floor: 'G', capacity: 20, isBookable: false },
    { propIdx: 0, ftCode: 'bbq_area', name: 'BBQ Terrace', floor: '24', capacity: 15, isBookable: true },
    { propIdx: 0, ftCode: 'concierge', name: 'Grand Lobby & Concierge', floor: 'G', capacity: null, isBookable: false },
    { propIdx: 0, ftCode: 'cctv', name: '24/7 CCTV System', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 0, ftCode: 'elevator', name: 'High-Speed Elevators (4)', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 0, ftCode: 'backup_power', name: 'Emergency Generator', floor: 'B1', capacity: null, isBookable: false },
    { propIdx: 1, ftCode: 'concierge', name: 'Corporate Lobby & Reception', floor: 'G', capacity: null, isBookable: false },
    { propIdx: 1, ftCode: 'meeting_room', name: 'Executive Conference Center', floor: '38', capacity: 60, isBookable: true },
    { propIdx: 1, ftCode: 'gym', name: 'Executive Gym', floor: '3', capacity: 25, isBookable: false },
    { propIdx: 1, ftCode: 'access_control', name: 'Card Access + Biometric', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 1, ftCode: 'elevator', name: 'High-Speed Elevators (8)', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 1, ftCode: 'ev_charging', name: 'EV Charging Stations', floor: 'B1', capacity: 12, isBookable: false },
    { propIdx: 2, ftCode: 'parking', name: 'Underground Parking', floor: 'B1', capacity: 200, isBookable: false },
    { propIdx: 2, ftCode: 'elevator', name: 'Escalators + Elevators', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 2, ftCode: 'cctv', name: 'CCTV + Security System', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 2, ftCode: 'guard_post', name: 'Security Guard Post', floor: 'G', capacity: null, isBookable: false },
    // Grand Central Mall
    { propIdx: 3, ftCode: 'parking', name: 'Multi-Level Parking (1200 bays)', floor: 'B1-B3', capacity: 1200, isBookable: false },
    { propIdx: 3, ftCode: 'elevator', name: 'Panoramic Elevators (12)', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 3, ftCode: 'cctv', name: 'Smart CCTV Network (400+)', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 3, ftCode: 'guard_post', name: '24/7 Security (5 posts)', floor: 'All', capacity: null, isBookable: false },
    // Brooklyn Galleria
    { propIdx: 4, ftCode: 'parking', name: 'Covered Parking (800 bays)', floor: 'B1-B2', capacity: 800, isBookable: false },
    { propIdx: 4, ftCode: 'elevator', name: 'Glass Elevators (8)', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 4, ftCode: 'ev_charging', name: 'EV Charging (24 stations)', floor: 'B1', capacity: 24, isBookable: false },
    // Midtown Plaza
    { propIdx: 5, ftCode: 'parking', name: 'Automated Parking (2000 bays)', floor: 'B1-B4', capacity: 2000, isBookable: false },
    { propIdx: 5, ftCode: 'elevator', name: 'Express Elevators (16)', floor: 'All', capacity: null, isBookable: false },
    { propIdx: 5, ftCode: 'rooftop_garden', name: 'Sky Garden & Observation Deck', floor: '10', capacity: 500, isBookable: false },
    { propIdx: 5, ftCode: 'backup_power', name: 'Dual Backup Generators', floor: 'B4', capacity: null, isBookable: false },
  ];
  let facCount = 0;
  for (const f of facilityData) {
    const ftId = ftMap[f.ftCode];
    if (!ftId) continue;
    await prisma.propertyFacility.upsert({
      where: { uq_property_facility: { propertyId: properties[f.propIdx].id, facilityTypeId: ftId } },
      create: { propertyId: properties[f.propIdx].id, facilityTypeId: ftId, name: f.name, floor: f.floor, capacity: f.capacity, isBookable: f.isBookable },
      update: {},
    });
    facCount++;
  }
  console.log('  ✅ ' + FACILITY_TYPES.length + ' facility types, ' + facCount + ' property facilities');

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 2.2 — Units                          ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 2.2 — Units');

  const unitConfigs: { propIdx: number; floor: number; type: string; count: number; baseRent: number }[] = [
    // Marina Bay Residences (25 floors)
    ...Array.from({ length: 5 }, (_, i) => ({ propIdx: 0, floor: i + 1,  type: 'studio',    count: 4, baseRent: 1500 })),
    ...Array.from({ length: 8 }, (_, i) => ({ propIdx: 0, floor: i + 6,  type: '1br',   count: 4, baseRent: 2200 })),
    ...Array.from({ length: 6 }, (_, i) => ({ propIdx: 0, floor: i + 14, type: '2br',   count: 4, baseRent: 3200 })),
    ...Array.from({ length: 4 }, (_, i) => ({ propIdx: 0, floor: i + 20, type: '3br',  count: 3, baseRent: 5000 })),
    { propIdx: 0, floor: 24, type: 'penthouse', count: 2, baseRent: 15000 },
    { propIdx: 0, floor: 25, type: 'penthouse', count: 1, baseRent: 25000 },
    // Central Business Tower (40 floors)
    ...Array.from({ length: 10 }, (_, i) => ({ propIdx: 1, floor: i + 1,  type: 'office_m', count: 6, baseRent: 5500 })),
    ...Array.from({ length: 15 }, (_, i) => ({ propIdx: 1, floor: i + 11, type: 'office_m', count: 5, baseRent: 7000 })),
    ...Array.from({ length: 10 }, (_, i) => ({ propIdx: 1, floor: i + 26, type: 'office_l', count: 4, baseRent: 9500 })),
    ...Array.from({ length: 5 },  (_, i) => ({ propIdx: 1, floor: i + 36, type: 'office_l', count: 3, baseRent: 12000 })),
    // Sunset Mall (5 floors)
    { propIdx: 2, floor: 1, type: 'retail', count: 14, baseRent: 4000 },
    { propIdx: 2, floor: 2, type: 'retail', count: 12, baseRent: 3500 },
    { propIdx: 2, floor: 3, type: 'retail', count: 10, baseRent: 3000 },
    { propIdx: 2, floor: 4, type: 'office_s', count: 8, baseRent: 2500 },
    { propIdx: 2, floor: 5, type: 'office_s', count: 6, baseRent: 2200 },

    // ── Grand Central Mall (8 floors, ~800 units) ──
    ...Array.from({ length: 8 }, (_, i) => {
      const floor = i + 1;
      const unitsPerFloor = floor <= 2 ? 120 : floor <= 4 ? 110 : floor <= 6 ? 100 : floor === 7 ? 80 : 60;
      const type = floor <= 6 ? 'retail' : 'f_and_b';
      const rent = floor <= 2 ? 5000 : floor <= 4 ? 4200 : floor <= 6 ? 3600 : 3000;
      return { propIdx: 3, floor, type, count: unitsPerFloor, baseRent: rent };
    }),
    // ── Brooklyn Galleria (6 floors, ~850 units) ──
    ...Array.from({ length: 6 }, (_, i) => {
      const floor = i + 1;
      const unitsPerFloor = floor === 1 ? 160 : floor === 2 ? 155 : floor === 3 ? 150 : floor === 4 ? 145 : floor === 5 ? 130 : 110;
      const rent = floor <= 2 ? 4500 : floor <= 4 ? 3800 : 3200;
      return { propIdx: 4, floor, type: 'retail' as const, count: unitsPerFloor, baseRent: rent };
    }),
    // ── Midtown Plaza (10 floors, ~1000 units) ──
    ...Array.from({ length: 10 }, (_, i) => {
      const floor = i + 1;
      const unitsPerFloor = floor <= 2 ? 120 : floor <= 5 ? 110 : floor <= 7 ? 100 : floor <= 9 ? 90 : 60;
      const rent = floor <= 3 ? 6000 : floor <= 6 ? 5000 : floor <= 8 ? 4200 : 3500;
      return { propIdx: 5, floor, type: 'retail' as const, count: unitsPerFloor, baseRent: rent };
    }),
  ];

  const allUnits: any[] = [];
  const statusOptions = ['available', 'occupied', 'reserved', 'maintenance', 'not_for_rent'];
  const statusWeights = [0.30, 0.45, 0.10, 0.08, 0.07]; // realistic distribution

  for (const cfg of unitConfigs) {
    const prefix = propData[cfg.propIdx].code;
    const batchData: any[] = [];
    for (let i = 1; i <= cfg.count; i++) {
      const unitNumber = `${prefix}-${String(cfg.floor).padStart(2, '0')}-${String(i).padStart(3, '0')}`;
      const areaSqft = cfg.type === 'studio' ? 450 : cfg.type === '1br' ? 650 : cfg.type === '2br' ? 950 :
                       cfg.type === '3br' ? 1400 : cfg.type === 'penthouse' ? 3200 :
                       cfg.type === 'retail' ? 200 + Math.floor(Math.random() * 600) :
                       cfg.type === 'f_and_b' ? 300 + Math.floor(Math.random() * 500) : 1200 + i * 200;

      // Assign realistic status distribution for malls
      const rand = Math.random();
      let cumWeight = 0;
      let status = 'vacant';
      for (let s = 0; s < statusOptions.length; s++) {
        cumWeight += statusWeights[s];
        if (rand <= cumWeight) { status = statusOptions[s]; break; }
      }

      batchData.push({
        propertyId: properties[cfg.propIdx].id, companyId: COMPANY_ID,
        unitNumber, unitType: cfg.type, floorNumber: cfg.floor,
        areaSqft: dec(String(areaSqft)),
        status,
        bedroomCount: cfg.type === 'studio' ? 0 : cfg.type === '1br' ? 1 : cfg.type === '2br' ? 2 : cfg.type === '3br' ? 3 : 0,
        bathroomCount: cfg.type === 'studio' ? 1 : cfg.type === '1br' ? 1 : cfg.type === '2br' ? 2 : cfg.type === '3br' ? 2 : 0,
      });
    }

    // Use createMany for large batches (much faster than individual upserts)
    if (batchData.length > 20) {
      await prisma.unit.createMany({ data: batchData, skipDuplicates: true });
      allUnits.push(...batchData);
    } else {
      for (const u of batchData) {
        const created = await prisma.unit.upsert({
          where: { uq_unit_number_property: { unitNumber: u.unitNumber, propertyId: u.propertyId } },
          create: u, update: {},
        });
        allUnits.push(created);
      }
    }
  }
  console.log(`  ✅ ${allUnits.length} units across ${properties.length} properties`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 2.3 — Tenants + KYC                  ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 2.3 — Tenants, KYC, Emergency Contacts');

  // KYC Requirements
  const kycReqs = [
    { tenantType: 'individual', docType: 'passport',         name: 'Passport / National ID',    isRequired: true,  validityDays: 1825, sortOrder: 1 },
    { tenantType: 'individual', docType: 'proof_of_address', name: 'Proof of Address',          isRequired: true,  validityDays: 90,   sortOrder: 2 },
    { tenantType: 'individual', docType: 'income_proof',     name: 'Proof of Income',           isRequired: true,  validityDays: 90,   sortOrder: 3 },
    { tenantType: 'company',    docType: 'business_reg',     name: 'Business Registration',     isRequired: true,  validityDays: 365,  sortOrder: 1 },
    { tenantType: 'company',    docType: 'board_resolution', name: 'Board Resolution',          isRequired: true,  validityDays: null, sortOrder: 2 },
    { tenantType: 'company',    docType: 'financial_stmt',   name: 'Financial Statements',      isRequired: false, validityDays: 365,  sortOrder: 3 },
  ];
  for (const req of kycReqs) {
    await prisma.kycRequirement.create({ data: { ...req, companyId: COMPANY_ID, description: `Required: ${req.name}` } }).catch(() => {});
  }

  // Individual Tenants
  const tenantData = [
    { firstName: 'John',    lastName: 'Anderson',  email: 'john.anderson@email.com',  phone: '+1-555-0101', mobile: '+1-555-0102',  kycStatus: 'verified',  source: 'walk_in',  tags: ['premium', 'long_term'], addressLine1: '45 Oak Street', city: 'New York', postalCode: '10001', country: 'US', dateOfBirth: d('1985-03-15'), idType: 'passport', idNumber: 'US-9283746' },
    { firstName: 'Sarah',   lastName: 'Chen',      email: 'sarah.chen@email.com',     phone: '+65-8123-4567', mobile: '+65-9123-4567', kycStatus: 'verified', source: 'referral', tags: ['referral_bonus'], addressLine1: '12 Orchard Road', city: 'Singapore', postalCode: '238888', country: 'SG', dateOfBirth: d('1990-07-22'), idType: 'nric', idNumber: 'S9012345A' },
    { firstName: 'Michael', lastName: 'Brown',     email: 'michael.brown@email.com',  phone: '+44-20-7946-0123', mobile: '+44-7911-123456', kycStatus: 'in_review', source: 'agent', tags: ['expat'], addressLine1: '88 Baker Street', city: 'London', postalCode: 'NW1 6XE', country: 'GB', dateOfBirth: d('1978-11-05'), idType: 'passport', idNumber: 'GB-5647382' },
    { firstName: 'Emily',   lastName: 'Park',      email: 'emily.park@email.com',     phone: null, mobile: '+82-10-1234-5678', kycStatus: 'pending', source: 'online', tags: ['young_professional'], addressLine1: '23 Gangnam-daero', city: 'Seoul', postalCode: '06236', country: 'KR', dateOfBirth: d('1995-02-28'), idType: 'passport', idNumber: 'M87654321' },
    { firstName: 'David',   lastName: 'Martinez',  email: 'david.martinez@email.com', phone: '+1-555-0201', mobile: '+1-555-0202', kycStatus: 'verified', source: 'walk_in', tags: [], addressLine1: '1250 Sunset Blvd', city: 'Los Angeles', postalCode: '90026', country: 'US', dateOfBirth: d('1982-09-10'), idType: 'driving_license', idNumber: 'DL-CA-7654321' },
    { firstName: 'Lisa',    lastName: 'Nguyen',    email: 'lisa.nguyen@email.com',    phone: '+84-28-1234-5678', mobile: '+84-909-123456', kycStatus: 'rejected', source: 'agent', tags: ['pending_docs'], addressLine1: '56 Nguyen Hue', city: 'Ho Chi Minh City', postalCode: '70000', country: 'VN', dateOfBirth: d('1988-12-03'), idType: 'passport', idNumber: 'B12345678' },
    { firstName: 'James',   lastName: 'Wilson',    email: 'james.wilson@email.com',   phone: '+61-2-9876-5432', mobile: '+61-400-123-456', kycStatus: 'verified', source: 'referral', tags: ['vip', 'long_term'], addressLine1: '789 Collins Street', city: 'Melbourne', postalCode: '3000', country: 'AU', dateOfBirth: d('1975-06-18'), idType: 'passport', idNumber: 'PA-AU-4321567' },
  ];

  const tenants: any[] = [];
  for (const t of tenantData) {
    const tenant = await prisma.tenant.create({
      data: {
        ...t, companyId: COMPANY_ID, tenantType: 'individual',
        kycVerifiedAt: t.kycStatus === 'verified' ? d('2024-06-01') : null,
        kycVerifiedBy: t.kycStatus === 'verified' ? admin.id : null,
      },
    });
    tenants.push(tenant);
  }

  // Corporate Tenants
  const corpData = [
    { companyName: 'TechNova Solutions Pte Ltd', companyRegNo: '202312345K', companyType: 'private_limited', email: 'leasing@technova.io', phone: '+65-6789-0123', contactPersonName: 'Rachel Tan', contactPersonPhone: '+65-9876-5432', contactPersonEmail: 'rachel.tan@technova.io', contactPersonRole: 'Office Manager', kycStatus: 'verified', source: 'agent', tags: ['tech', 'corporate'] },
    { companyName: 'Brewed Awakening Café',     companyRegNo: '53123456A',   companyType: 'sole_prop',       email: 'hello@brewedawakening.com', phone: '+1-555-0301', contactPersonName: 'Maria Rodriguez', contactPersonPhone: '+1-555-0303', contactPersonEmail: 'maria@brewedawakening.com', contactPersonRole: 'Owner', kycStatus: 'verified', source: 'walk_in', tags: ['retail', 'f_and_b'] },
    { companyName: 'Harper & Cole LLP',         companyRegNo: 'T08LL1234A',  companyType: 'partnership',     email: 'admin@harpercole.com', phone: '+65-6234-5678', contactPersonName: 'William Harper', contactPersonPhone: '+65-9111-2222', contactPersonEmail: 'w.harper@harpercole.com', contactPersonRole: 'Managing Partner', kycStatus: 'in_review', source: 'online', tags: ['legal', 'corporate', 'high_value'] },
  ];

  for (const c of corpData) {
    const tenant = await prisma.tenant.create({
      data: {
        ...c, companyId: COMPANY_ID, tenantType: 'corporate',
        addressLine1: '456 Business Ave', city: 'New York', country: 'US',
        kycVerifiedAt: c.kycStatus === 'verified' ? d('2024-04-01') : null,
        kycVerifiedBy: c.kycStatus === 'verified' ? admin.id : null,
      },
    });
    tenants.push(tenant);
  }

  // Emergency Contacts
  const emergencyContacts = [
    { tenantId: tenants[0].id, name: 'Linda Anderson',  relationship: 'spouse',  phone: '+1-555-0103', isPrimary: true },
    { tenantId: tenants[1].id, name: 'Wei Chen',        relationship: 'father',  phone: '+65-8234-5678', isPrimary: true },
    { tenantId: tenants[4].id, name: 'Ana Martinez',    relationship: 'wife',    phone: '+1-555-0203', isPrimary: true },
    { tenantId: tenants[6].id, name: 'Karen Wilson',    relationship: 'sister',  phone: '+61-400-456-789', isPrimary: true },
  ];
  for (const ec of emergencyContacts) {
    await prisma.tenantEmergencyContact.create({ data: ec });
  }

  // Tenant Notes
  for (const [idx, content, pinned] of [
    [0, 'Tenant inquired about upgrading to a larger unit (3BR). Follow up in Q3.', true],
    [0, 'Submitted maintenance request for AC unit — resolved within 2 days.', false],
    [1, 'Preferred communication via WhatsApp. Do not call during office hours.', true],
    [6, 'VIP tenant — always send renewal notices 3 months in advance.', true],
    [6, 'Referred Sarah Chen. Applied referral discount on next renewal.', false],
    [7, 'Company is expanding rapidly. May need additional floors by mid-2026.', true],
    [8, 'Requested permission for outdoor seating area. Approved with conditions.', false],
  ] as const) {
    await prisma.tenantNote.create({ data: { tenantId: tenants[idx as number].id, content: content as string, isPinned: pinned as boolean, createdBy: admin.id } });
  }

  console.log(`  ✅ ${tenants.length} tenants (7 individual + 3 corporate)`);
  console.log(`  ✅ ${emergencyContacts.length} emergency contacts, 7 notes, 6 KYC requirements`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 2.4 — Leases                         ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 2.4 — Leases');

  const leaseData = [
    { tenant: 0, unit: 0,  num: 'LS-2024-0001', status: 'active',  start: '2024-07-01', end: '2026-06-30', months: 24, rent: '2500.00', deposit: '5000.00',  notes: 'Standard 2-year residential lease.' },
    { tenant: 1, unit: 1,  num: 'LS-2024-0002', status: 'active',  start: '2024-09-01', end: '2025-08-31', months: 12, rent: '1800.00', deposit: '3600.00',  notes: 'Referral discount — $200/mo off standard rate.' },
    { tenant: 6, unit: 2,  num: 'LS-2023-0001', status: 'active',  start: '2023-12-01', end: '2025-11-30', months: 24, rent: '3200.00', deposit: '6400.00',  notes: 'VIP tenant. 3% annual escalation.' },
    { tenant: 7, unit: 15, num: 'LS-2024-0003', status: 'active',  start: '2024-04-01', end: '2027-03-31', months: 36, rent: '8500.00', deposit: '25500.00', notes: 'Corporate 3-year office lease.' },
    { tenant: 4, unit: 3,  num: 'LS-2025-0001', status: 'draft',   start: '2025-07-01', end: '2026-06-30', months: 12, rent: '2100.00', deposit: '4200.00',  notes: 'Draft — pending signature.' },
    { tenant: 8, unit: 30, num: 'LS-2024-0004', status: 'active',  start: '2024-11-01', end: '2027-10-31', months: 36, rent: '4200.00', deposit: '12600.00', notes: 'F&B tenant. Outdoor seating approved.' },
    { tenant: 2, unit: 4,  num: 'LS-2024-0005', status: 'expired', start: '2024-01-01', end: '2024-12-31', months: 12, rent: '1950.00', deposit: '3900.00',  notes: 'Expired — tenant relocated.' },
  ];

  const leases: any[] = [];
  for (const l of leaseData) {
    if (!tenants[l.tenant] || !allUnits[l.unit]) {
      console.log(`  ⚠️  Skipping lease ${l.num}: tenant[${l.tenant}] or unit[${l.unit}] missing`);
      continue;
    }
    try {
      const lease = await prisma.lease.create({
        data: {
          companyId: COMPANY_ID, propertyId: allUnits[l.unit].propertyId,
          tenantId: tenants[l.tenant].id, unitId: allUnits[l.unit].id,
          leaseNumber: l.num, status: l.status,
          startDate: d(l.start), endDate: d(l.end), leaseTermMonths: l.months,
          rentAmount: dec(l.rent), currency: 'USD', billingCycle: 'monthly', billingDay: 1, paymentDueDays: 7,
          securityDeposit: dec(l.deposit),
          depositPaid: l.status !== 'draft',
          depositPaidAt: l.status !== 'draft' ? d(l.start) : null,
          activatedAt: l.status === 'active' || l.status === 'expired' ? d(l.start) : null,
          notes: l.notes,
          createdBy: admin.id,
        },
      });
      leases.push(lease);

      if (l.status === 'active') {
        await prisma.unit.update({ where: { id: allUnits[l.unit].id }, data: { status: 'occupied' } });
      }
    } catch (e: any) {
      console.log(`  ⚠️  Lease ${l.num} skipped: ${e.message?.slice(0, 60)}`);
    }
  }
  console.log(`  ✅ ${leases.length} leases (4 active, 1 draft, 1 expired)`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 2.5 — CRM (Leads, Viewings, Camps)   ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 2.5 — CRM & Leasing');

  // Marketing Campaigns
  const campaigns = [
    { name: 'Summer Move-In Special 2025', channel: 'facebook',   budget: dec('5000'),  startDate: d('2025-06-01'), endDate: d('2025-08-31'), status: 'active',    totalLeads: 15, totalConversions: 3, totalRevenue: dec('72000') },
    { name: 'Corporate Office Q4 Push',    channel: 'google_ads', budget: dec('12000'), startDate: d('2025-10-01'), endDate: d('2025-12-31'), status: 'active',    totalLeads: 8,  totalConversions: 2, totalRevenue: dec('204000') },
    { name: 'Referral Rewards Program',    channel: 'email',      budget: dec('1500'),  startDate: d('2025-01-01'), endDate: null,            status: 'active',    totalLeads: 22, totalConversions: 7, totalRevenue: dec('168000') },
    { name: 'Spring Open House',           channel: 'portal',     budget: dec('3000'),  startDate: d('2025-03-15'), endDate: d('2025-04-15'), status: 'completed', totalLeads: 30, totalConversions: 5, totalRevenue: dec('120000') },
  ];

  const campRecords: any[] = [];
  for (const c of campaigns) {
    const camp = await prisma.marketingCampaign.create({
      data: { ...c, companyId: COMPANY_ID, propertyId: properties[0].id, createdBy: admin.id },
    });
    campRecords.push(camp);
  }
  console.log(`  ✅ ${campRecords.length} marketing campaigns`);

  // Leads
  const leadData = [
    { firstName: 'Anna',   lastName: 'Schmidt',  email: 'anna.schmidt@email.de',     mobile: '+49-170-1234567',  stage: 'new',               priority: 'high',   source: 'website',  propIdx: 0, campIdx: 0, agentId: agent1.id, budget: [2000, 3500], unitPref: '2br' },
    { firstName: 'Robert', lastName: 'Kim',      email: 'r.kim@company.kr',          mobile: '+82-10-9876-5432', stage: 'contacted',         priority: 'medium', source: 'portal',   propIdx: 1, campIdx: 1, agentId: agent1.id, budget: [5000, 8000], unitPref: 'office' },
    { firstName: 'Maria',  lastName: 'Garcia',   email: 'maria.g@gmail.com',         mobile: '+1-555-0501',      stage: 'viewing_scheduled', priority: 'high',   source: 'walk_in',  propIdx: 0, campIdx: null, agentId: agent2.id, budget: [1500, 2500], unitPref: '1br' },
    { firstName: 'Alex',   lastName: 'Thompson', email: 'alex.t@outlook.com',        mobile: '+1-555-0502',      stage: 'viewed',            priority: 'medium', source: 'referral', propIdx: 0, campIdx: 2, agentId: agent2.id, budget: [2500, 4000], unitPref: '2br' },
    { firstName: 'Yuki',   lastName: 'Tanaka',   email: 'yuki.tanaka@email.jp',      mobile: '+81-90-1234-5678', stage: 'offer_sent',        priority: 'high',   source: 'agent',    propIdx: 1, campIdx: 1, agentId: agent1.id, budget: [6000, 10000], unitPref: 'office' },
    { firstName: 'Pierre', lastName: 'Dubois',   email: 'pierre.d@email.fr',         mobile: '+33-6-12345678',   stage: 'negotiating',       priority: 'high',   source: 'website',  propIdx: 0, campIdx: 0, agentId: agent2.id, budget: [3000, 5000], unitPref: '3br' },
    { firstName: 'Olivia', lastName: 'Johnson',  email: 'olivia.j@email.com',        mobile: '+1-555-0503',      stage: 'new',               priority: 'low',    source: 'website',  propIdx: 2, campIdx: 3, agentId: agent1.id, budget: [3000, 5000], unitPref: 'retail' },
    { firstName: 'Hassan', lastName: 'Ali',      email: 'h.ali@email.ae',            mobile: '+971-50-1234567',  stage: 'contacted',         priority: 'medium', source: 'agent',    propIdx: 1, campIdx: null, agentId: agent2.id, budget: [7000, 12000], unitPref: 'office' },
    { firstName: 'Sophie', lastName: 'Turner',   email: 'sophie.turner@email.co.uk', mobile: '+44-7700-900123',  stage: 'lost',              priority: 'medium', source: 'portal',   propIdx: 0, campIdx: 3, agentId: agent1.id, budget: [1800, 2500], unitPref: '1br' },
    { firstName: 'Chen',   lastName: 'Wei',      companyName: 'GreenTech Innovations', email: 'leasing@greentech.io', mobile: '+1-555-0600', stage: 'viewing_scheduled', priority: 'high', source: 'website', propIdx: 1, campIdx: 1, agentId: agent2.id, budget: [8000, 15000], unitPref: 'office' },
  ];

  const leadRecords: any[] = [];
  for (let i = 0; i < leadData.length; i++) {
    const l = leadData[i];
    const lead = await prisma.lead.create({
      data: {
        companyId: COMPANY_ID, propertyId: properties[l.propIdx].id,
        leadNumber: `LD-202505-${String(i + 1).padStart(4, '0')}`,
        firstName: l.firstName, lastName: l.lastName, companyName: (l as any).companyName || null,
        email: l.email, mobile: l.mobile, stage: l.stage, priority: l.priority, source: l.source,
        assignedTo: l.agentId,
        campaignId: l.campIdx !== null ? campRecords[l.campIdx].id : null,
        budgetMin: dec(String(l.budget[0])), budgetMax: dec(String(l.budget[1])),
        unitTypePreference: l.unitPref,
        lostReason: l.stage === 'lost' ? 'Found cheaper option elsewhere' : null,
        lostAt: l.stage === 'lost' ? d('2025-04-20') : null,
      },
    });
    leadRecords.push(lead);

    // Activity log
    await prisma.leadActivity.create({
      data: { leadId: lead.id, activityType: 'note', description: `Lead created from ${l.source}`, performedBy: l.agentId },
    });
  }
  console.log(`  ✅ ${leadRecords.length} leads (new, contacted, viewing, viewed, offer, negotiating, lost)`);

  // Viewings
  const viewingStages = ['viewing_scheduled', 'viewed', 'offer_sent', 'negotiating'];
  let viewingCount = 0;
  for (let i = 0; i < leadData.length; i++) {
    if (!viewingStages.includes(leadData[i].stage)) continue;
    const propUnits = allUnits.filter((u: any) => u.propertyId === properties[leadData[i].propIdx].id);
    if (propUnits.length === 0) continue;
    await prisma.leadViewing.create({
      data: {
        leadId: leadRecords[i].id, propertyId: properties[leadData[i].propIdx].id,
        unitId: propUnits[viewingCount % propUnits.length].id,
        scheduledAt: d('2025-05-25T10:00:00Z'), durationMinutes: 30,
        agentId: leadData[i].agentId,
        status: leadData[i].stage === 'viewing_scheduled' ? 'scheduled' : 'completed',
        outcome: leadData[i].stage !== 'viewing_scheduled' ? 'interested' : null,
        agentNotes: leadData[i].stage !== 'viewing_scheduled' ? 'Prospect showed strong interest.' : null,
      },
    });
    viewingCount++;
  }
  console.log(`  ✅ ${viewingCount} viewings`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 2.6 — Parking Management             ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 2.6 — Parking Management');

  // Zones
  const zoneData = [
    { name: 'Basement Level 1', code: 'B1', zoneType: 'basement', propIdx: 0 },
    { name: 'Basement Level 2', code: 'B2', zoneType: 'basement', propIdx: 0 },
    { name: 'Open Air Parking', code: 'OA', zoneType: 'open',     propIdx: 0 },
    { name: 'Underground Lot',  code: 'UG', zoneType: 'basement', propIdx: 1 },
    { name: 'Rooftop Parking',  code: 'RT', zoneType: 'rooftop',  propIdx: 1 },
    { name: 'Visitor Lot',      code: 'VL', zoneType: 'open',     propIdx: 2 },
    // Grand Central Mall
    { name: 'GCM Basement B1',  code: 'GCM-B1', zoneType: 'basement',    propIdx: 3 },
    { name: 'GCM Basement B2',  code: 'GCM-B2', zoneType: 'basement',    propIdx: 3 },
    { name: 'GCM Basement B3',  code: 'GCM-B3', zoneType: 'basement',    propIdx: 3 },
    // Brooklyn Galleria
    { name: 'BKG Level B1',     code: 'BKG-B1', zoneType: 'basement',    propIdx: 4 },
    { name: 'BKG Level B2',     code: 'BKG-B2', zoneType: 'basement',    propIdx: 4 },
    { name: 'BKG Rooftop',      code: 'BKG-RF', zoneType: 'rooftop',     propIdx: 4 },
    // Midtown Plaza
    { name: 'MTP Level B1',     code: 'MTP-B1', zoneType: 'basement',    propIdx: 5 },
    { name: 'MTP Level B2',     code: 'MTP-B2', zoneType: 'basement',    propIdx: 5 },
    { name: 'MTP Level B3',     code: 'MTP-B3', zoneType: 'basement',    propIdx: 5 },
    { name: 'MTP Level B4',     code: 'MTP-B4', zoneType: 'basement',    propIdx: 5 },
  ];

  const zones: any[] = [];
  for (const z of zoneData) {
    const zone = await prisma.parkingZone.create({
      data: { name: z.name, code: z.code, zoneType: z.zoneType, propertyId: properties[z.propIdx].id, companyId: COMPANY_ID },
    });
    zones.push(zone);
  }
  console.log(`  ✅ ${zones.length} parking zones`);

  // Slots — bulk create per zone
  const slotConfigs = [
    { zoneIdx: 0, prefix: 'B1-', count: 30, type: 'car', rate: 150, evAt: [5, 10] },
    { zoneIdx: 1, prefix: 'B2-', count: 25, type: 'car', rate: 130, evAt: [] as number[] },
    { zoneIdx: 2, prefix: 'OA-', count: 15, type: 'car', rate: 100, evAt: [3] },
    { zoneIdx: 3, prefix: 'UG-', count: 40, type: 'car', rate: 200, evAt: [8, 16, 24] },
    { zoneIdx: 4, prefix: 'RT-', count: 20, type: 'car', rate: 120, evAt: [] as number[] },
    { zoneIdx: 5, prefix: 'VL-', count: 10, type: 'car', rate: 0,   evAt: [] as number[] },
    // Grand Central Mall (3 levels × ~130 = ~400 slots)
    { zoneIdx: 6,  prefix: 'GCM-B1-', count: 140, type: 'car', rate: 250, evAt: [10, 20, 30, 40, 50] },
    { zoneIdx: 7,  prefix: 'GCM-B2-', count: 130, type: 'car', rate: 220, evAt: [15, 30, 45] },
    { zoneIdx: 8,  prefix: 'GCM-B3-', count: 120, type: 'car', rate: 200, evAt: [20, 40] },
    // Brooklyn Galleria (3 levels × ~100 = ~280 slots)
    { zoneIdx: 9,  prefix: 'BKG-B1-', count: 110, type: 'car', rate: 200, evAt: [10, 20, 30, 40] },
    { zoneIdx: 10, prefix: 'BKG-B2-', count: 100, type: 'car', rate: 180, evAt: [15, 30] },
    { zoneIdx: 11, prefix: 'BKG-RF-', count: 70,  type: 'car', rate: 100, evAt: [] as number[] },
    // Midtown Plaza (4 levels × ~125 = ~500 slots)
    { zoneIdx: 12, prefix: 'MTP-B1-', count: 150, type: 'car', rate: 300, evAt: [10, 20, 30, 40, 50, 60] },
    { zoneIdx: 13, prefix: 'MTP-B2-', count: 140, type: 'car', rate: 280, evAt: [15, 30, 45] },
    { zoneIdx: 14, prefix: 'MTP-B3-', count: 120, type: 'car', rate: 250, evAt: [20, 40] },
    { zoneIdx: 15, prefix: 'MTP-B4-', count: 100, type: 'car', rate: 220, evAt: [25, 50] },
  ];

  let totalSlots = 0;
  const allSlots: any[] = [];
  for (const cfg of slotConfigs) {
    const batch: any[] = [];
    for (let i = 1; i <= cfg.count; i++) {
      batch.push({
        propertyId: zones[cfg.zoneIdx].propertyId, companyId: COMPANY_ID, zoneId: zones[cfg.zoneIdx].id,
        slotNumber: `${cfg.prefix}${String(i).padStart(3, '0')}`,
        slotType: i <= 2 && cfg.zoneIdx < 3 ? 'disabled' : cfg.evAt.includes(i) ? 'ev' : cfg.type,
        size: 'standard', hasEvCharger: cfg.evAt.includes(i),
        evChargerType: cfg.evAt.includes(i) ? 'Type 2' : null,
        monthlyRate: cfg.rate > 0 ? dec(String(cfg.rate)) : null,
        status: 'available',
      });
    }
    await prisma.parkingSlot.createMany({ data: batch, skipDuplicates: true });
    totalSlots += batch.length;
    const created = await prisma.parkingSlot.findMany({ where: { zoneId: zones[cfg.zoneIdx].id }, orderBy: { slotNumber: 'asc' } });
    allSlots.push(...created);
  }
  console.log(`  ✅ ${totalSlots} parking slots (incl. EV + disabled)`);

  // Tenant Vehicles
  const vehicleData = [
    { tidx: 0, plate: 'NY-ABC-1234', make: 'Toyota',   model: 'Camry',    color: 'Silver', type: 'car' },
    { tidx: 1, plate: 'SG-SBA-5678', make: 'BMW',      model: '3 Series', color: 'Black',  type: 'car' },
    { tidx: 4, plate: 'CA-7654321',  make: 'Tesla',    model: 'Model 3',  color: 'White',  type: 'ev' },
    { tidx: 6, plate: 'AU-XYZ-999',  make: 'Mercedes', model: 'C200',     color: 'Gray',   type: 'car' },
    { tidx: 7, plate: 'BIZ-TN-001',  make: 'Honda',    model: 'Civic',    color: 'Blue',   type: 'car' },
  ];

  const vehicles: any[] = [];
  for (const v of vehicleData) {
    if (!tenants[v.tidx]) continue;
    let vehicle = await prisma.tenantVehicle.findFirst({
      where: { plateNumber: v.plate, companyId: COMPANY_ID },
    });
    if (!vehicle) {
      vehicle = await prisma.tenantVehicle.create({
        data: { tenantId: tenants[v.tidx].id, companyId: COMPANY_ID, plateNumber: v.plate, make: v.make, model: v.model, color: v.color, vehicleType: v.type },
      });
    }
    vehicles.push(vehicle);
  }
  console.log(`  ✅ ${vehicles.length} tenant vehicles`);

  // Allocations
  const allocData = [
    { slotIdx: 2,  tidx: 0, vidx: 0, rate: 150 },
    { slotIdx: 3,  tidx: 1, vidx: 1, rate: 150 },
    { slotIdx: 4,  tidx: 4, vidx: 2, rate: 150 },
    { slotIdx: 5,  tidx: 6, vidx: 3, rate: 150 },
    { slotIdx: 70, tidx: 7, vidx: 4, rate: 200 },
  ];

  let allocCount = 0;
  for (const a of allocData) {
    if (!allSlots[a.slotIdx] || !tenants[a.tidx]) continue;
    await prisma.parkingAllocation.create({
      data: {
        slotId: allSlots[a.slotIdx].id, propertyId: allSlots[a.slotIdx].propertyId,
        companyId: COMPANY_ID, tenantId: tenants[a.tidx].id,
        vehicleId: vehicles[a.vidx]?.id || null,
        startDate: d('2025-01-01'), monthlyRate: dec(String(a.rate)),
        billingDay: 1, status: 'active', createdBy: admin.id,
      },
    });
    await prisma.parkingSlot.update({ where: { id: allSlots[a.slotIdx].id }, data: { status: 'allocated' } });
    allocCount++;
  }
  console.log(`  ✅ ${allocCount} parking allocations`);

  // Visitor Passes
  const visitorPasses = [
    { name: 'Jane Doe',       plate: 'VIS-001', propIdx: 0, status: 'active',    entryAt: d('2025-05-20T09:15:00Z') },
    { name: 'Bob Contractor', plate: 'CTR-555', propIdx: 1, status: 'pending',   entryAt: null },
    { name: 'Amy Client',     plate: 'CLI-777', propIdx: 0, status: 'completed', entryAt: d('2025-05-19T14:00:00Z') },
  ];

  for (const vp of visitorPasses) {
    const token = `VP-${vp.name.replace(/\s/g, '').toUpperCase().slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`;
    await prisma.visitorParkingPass.create({
      data: {
        propertyId: properties[vp.propIdx].id, companyId: COMPANY_ID,
        issuedBy: admin.id, visitorName: vp.name, visitorVehiclePlate: vp.plate,
        qrToken: token,
        validFrom: d('2025-05-20T08:00:00Z'), validTo: d('2025-05-20T18:00:00Z'),
        maxHours: 4, status: vp.status,
        actualEntryAt: vp.entryAt,
        actualExitAt: vp.status === 'completed' ? d('2025-05-19T17:30:00Z') : null,
      },
    });
  }
  console.log(`  ✅ ${visitorPasses.length} visitor parking passes`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 1.4 — Workflow Engine                  ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 1.4 — Workflow Engine');

  // ── Workflow Definitions ──────────────────────
  const wfDefs = [
    {
      name: 'Lease Approval Workflow',
      description: 'Two-level approval for new lease agreements. Manager approves, then Director reviews high-value leases.',
      entityType: 'lease',
      status: 'active',
      version: 1,
      publishedAt: d('2025-03-01'),
      graph: {
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'mgr_approval', type: 'approval', data: {
            name: 'Manager Approval', assignTo: 'role:Super Admin',
            sla: { hours: 24, escalateTo: 'role:Super Admin' }, allowDelegate: true,
          }},
          { id: 'check_value', type: 'condition', data: {
            name: 'High-Value Check', expression: 'rentAmount > 10000',
            trueEdge: 'director_approval', falseEdge: 'notify_approved',
          }},
          { id: 'director_approval', type: 'approval', data: {
            name: 'Director Approval', assignTo: 'role:Super Admin',
            sla: { hours: 48 }, allowDelegate: true,
          }},
          { id: 'notify_approved', type: 'notification', data: {
            name: 'Approval Notification', template: 'workflow_completed',
            recipientType: 'initiator', message: 'Your lease has been approved!',
          }},
          { id: 'end', type: 'end' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'mgr_approval' },
          { id: 'e2', source: 'mgr_approval', target: 'check_value' },
          { id: 'e3', source: 'check_value', target: 'director_approval', label: 'High value' },
          { id: 'e4', source: 'check_value', target: 'notify_approved', label: 'Standard' },
          { id: 'e5', source: 'director_approval', target: 'notify_approved' },
          { id: 'e6', source: 'notify_approved', target: 'end' },
        ],
      },
    },
    {
      name: 'Invoice Approval',
      description: 'Single-level approval for invoices above $500.',
      entityType: 'invoice',
      status: 'active',
      version: 1,
      publishedAt: d('2025-03-15'),
      graph: {
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'finance_approval', type: 'approval', data: {
            name: 'Finance Manager Approval', assignTo: 'role:Super Admin',
            sla: { hours: 12 }, allowDelegate: false,
          }},
          { id: 'end', type: 'end' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'finance_approval' },
          { id: 'e2', source: 'finance_approval', target: 'end' },
        ],
      },
    },
    {
      name: 'Maintenance Ticket Escalation',
      description: 'Auto-route critical maintenance tickets through approval before dispatching.',
      entityType: 'maintenance_ticket',
      status: 'draft',
      version: 1,
      publishedAt: null,
      graph: {
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'severity_check', type: 'condition', data: {
            name: 'Critical Check', expression: 'severity == critical',
            trueEdge: 'emergency_approval', falseEdge: 'auto_dispatch',
          }},
          { id: 'emergency_approval', type: 'approval', data: {
            name: 'Emergency Authorization', assignTo: 'role:Super Admin',
            sla: { hours: 2 }, allowDelegate: true,
          }},
          { id: 'auto_dispatch', type: 'notification', data: {
            name: 'Dispatch Notification', template: 'maintenance_dispatched',
            recipientType: 'initiator', message: 'Ticket dispatched to maintenance team.',
          }},
          { id: 'end', type: 'end' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'severity_check' },
          { id: 'e2', source: 'severity_check', target: 'emergency_approval', label: 'Critical' },
          { id: 'e3', source: 'severity_check', target: 'auto_dispatch', label: 'Normal' },
          { id: 'e4', source: 'emergency_approval', target: 'auto_dispatch' },
          { id: 'e5', source: 'auto_dispatch', target: 'end' },
        ],
      },
    },
    {
      name: 'Move-In Checklist',
      description: 'Sequential approval for move-in: property team confirms, then operations signs off.',
      entityType: 'move_in',
      status: 'active',
      version: 2,
      publishedAt: d('2025-04-01'),
      graph: {
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'property_check', type: 'approval', data: {
            name: 'Property Team Check', assignTo: 'role:Super Admin',
            sla: { hours: 8 }, allowDelegate: true,
          }},
          { id: 'ops_signoff', type: 'approval', data: {
            name: 'Operations Sign-Off', assignTo: 'role:Super Admin',
            sla: { hours: 4 }, allowDelegate: false,
          }},
          { id: 'welcome_notify', type: 'notification', data: {
            name: 'Welcome Notification', template: 'tenant_welcome',
            recipientType: 'initiator', message: 'Welcome to your new unit!',
          }},
          { id: 'end', type: 'end' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'property_check' },
          { id: 'e2', source: 'property_check', target: 'ops_signoff' },
          { id: 'e3', source: 'ops_signoff', target: 'welcome_notify' },
          { id: 'e4', source: 'welcome_notify', target: 'end' },
        ],
      },
    },
  ];

  const wfDefRecords: any[] = [];
  for (const wf of wfDefs) {
    const def = await prisma.workflowDefinition.create({
      data: {
        companyId: COMPANY_ID, name: wf.name, description: wf.description,
        entityType: wf.entityType, version: wf.version, status: wf.status,
        graph: wf.graph as any, createdBy: admin.id,
        publishedAt: wf.publishedAt,
      },
    });
    wfDefRecords.push(def);
  }
  console.log(`  ✅ ${wfDefRecords.length} workflow definitions (${wfDefRecords.filter(d => d.status === 'active').length} active, ${wfDefRecords.filter(d => d.status === 'draft').length} draft)`);

  // ── Workflow Instances ────────────────────────
  // Use the engine to start some real instances for the active definitions
  const leaseApprovalDef = wfDefRecords[0]; // Lease Approval (active)
  const invoiceApprovalDef = wfDefRecords[1]; // Invoice Approval (active)
  const moveInDef = wfDefRecords[3]; // Move-In Checklist (active)

  // Instance 1: Running lease approval (pending at mgr_approval)
  const inst1 = await prisma.workflowInstance.create({
    data: {
      definitionId: leaseApprovalDef.id, definitionVersion: 1,
      entityType: 'lease', entityId: leases[0]?.id || 'lease-001',
      companyId: COMPANY_ID, currentNodeIds: ['mgr_approval'],
      status: 'running', initiatedBy: admin.id,
      context: { tenantName: 'John Smith', unitCode: 'MBR-01-001', rentAmount: 2200, leaseTermMonths: 12 },
    },
  });
  await prisma.workflowTask.create({
    data: {
      instanceId: inst1.id, nodeId: 'mgr_approval', taskType: 'approval',
      title: 'Manager Approval', assignedTo: admin.id,
      slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), status: 'pending',
    },
  });
  await prisma.workflowHistory.create({
    data: { instanceId: inst1.id, toNodeId: 'start', action: 'started', performedBy: admin.id },
  });

  // Instance 2: Running lease (high-value, pending at director_approval — mgr already approved)
  const inst2 = await prisma.workflowInstance.create({
    data: {
      definitionId: leaseApprovalDef.id, definitionVersion: 1,
      entityType: 'lease', entityId: leases[1]?.id || 'lease-002',
      companyId: COMPANY_ID, currentNodeIds: ['director_approval'],
      status: 'running', initiatedBy: agent1.id,
      context: { tenantName: 'Acme Corp', unitCode: 'CBT-05-002', rentAmount: 25000, leaseTermMonths: 24 },
    },
  });
  const task2a = await prisma.workflowTask.create({
    data: {
      instanceId: inst2.id, nodeId: 'mgr_approval', taskType: 'approval',
      title: 'Manager Approval', assignedTo: admin.id,
      status: 'approved', decision: 'approved', comments: 'Financials look solid. Approved.',
      completedAt: d('2025-05-18T14:30:00Z'), completedBy: admin.id,
    },
  });
  await prisma.workflowTask.create({
    data: {
      instanceId: inst2.id, nodeId: 'director_approval', taskType: 'approval',
      title: 'Director Approval', assignedTo: admin.id,
      slaDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000), status: 'pending',
    },
  });
  await prisma.workflowHistory.createMany({ data: [
    { instanceId: inst2.id, toNodeId: 'start', action: 'started', performedBy: agent1.id },
    { instanceId: inst2.id, taskId: task2a.id, fromNodeId: 'mgr_approval', toNodeId: 'mgr_approval', action: 'approved', performedBy: admin.id, comments: 'Financials look solid. Approved.' },
  ]});

  // Instance 3: Completed (approved) invoice
  const inst3 = await prisma.workflowInstance.create({
    data: {
      definitionId: invoiceApprovalDef.id, definitionVersion: 1,
      entityType: 'invoice', entityId: 'INV-2025-0042',
      companyId: COMPANY_ID, currentNodeIds: ['end'],
      status: 'approved', initiatedBy: agent2.id,
      startedAt: d('2025-05-15T10:00:00Z'), completedAt: d('2025-05-15T11:20:00Z'),
      context: { vendorName: 'Office Supplies Co.', amount: 1250, currency: 'USD', description: 'Q2 office supplies' },
    },
  });
  const task3 = await prisma.workflowTask.create({
    data: {
      instanceId: inst3.id, nodeId: 'finance_approval', taskType: 'approval',
      title: 'Finance Manager Approval', assignedTo: admin.id,
      status: 'approved', decision: 'approved', comments: 'Within budget. Approved.',
      completedAt: d('2025-05-15T11:20:00Z'), completedBy: admin.id,
    },
  });
  await prisma.workflowHistory.createMany({ data: [
    { instanceId: inst3.id, toNodeId: 'start', action: 'started', performedBy: agent2.id, createdAt: d('2025-05-15T10:00:00Z') },
    { instanceId: inst3.id, taskId: task3.id, fromNodeId: 'finance_approval', toNodeId: 'finance_approval', action: 'approved', performedBy: admin.id, comments: 'Within budget. Approved.', createdAt: d('2025-05-15T11:20:00Z') },
    { instanceId: inst3.id, toNodeId: 'end', action: 'completed', createdAt: d('2025-05-15T11:20:00Z') },
  ]});

  // Instance 4: Rejected lease
  const inst4 = await prisma.workflowInstance.create({
    data: {
      definitionId: leaseApprovalDef.id, definitionVersion: 1,
      entityType: 'lease', entityId: 'lease-rejected-001',
      companyId: COMPANY_ID, currentNodeIds: ['mgr_approval'],
      status: 'rejected', initiatedBy: agent1.id,
      startedAt: d('2025-05-10T09:00:00Z'), completedAt: d('2025-05-10T16:00:00Z'),
      context: { tenantName: 'Risky Tenant LLC', unitCode: 'SM-02-005', rentAmount: 3500, leaseTermMonths: 6 },
    },
  });
  const task4 = await prisma.workflowTask.create({
    data: {
      instanceId: inst4.id, nodeId: 'mgr_approval', taskType: 'approval',
      title: 'Manager Approval', assignedTo: admin.id,
      status: 'rejected', decision: 'rejected', comments: 'Insufficient credit history. KYC incomplete.',
      completedAt: d('2025-05-10T16:00:00Z'), completedBy: admin.id,
    },
  });
  await prisma.workflowHistory.createMany({ data: [
    { instanceId: inst4.id, toNodeId: 'start', action: 'started', performedBy: agent1.id, createdAt: d('2025-05-10T09:00:00Z') },
    { instanceId: inst4.id, taskId: task4.id, fromNodeId: 'mgr_approval', toNodeId: 'mgr_approval', action: 'rejected', performedBy: admin.id, comments: 'Insufficient credit history. KYC incomplete.', createdAt: d('2025-05-10T16:00:00Z') },
  ]});

  // Instance 5: Running move-in (pending at property_check)
  const inst5 = await prisma.workflowInstance.create({
    data: {
      definitionId: moveInDef.id, definitionVersion: 2,
      entityType: 'move_in', entityId: 'MOVEIN-2025-003',
      companyId: COMPANY_ID, currentNodeIds: ['property_check'],
      status: 'running', initiatedBy: agent2.id,
      context: { tenantName: 'Sarah Johnson', unitCode: 'MBR-08-002', moveInDate: '2025-06-01', keyCollected: false },
    },
  });
  await prisma.workflowTask.create({
    data: {
      instanceId: inst5.id, nodeId: 'property_check', taskType: 'approval',
      title: 'Property Team Check', assignedTo: admin.id,
      slaDueAt: new Date(Date.now() + 8 * 60 * 60 * 1000), status: 'pending',
    },
  });
  await prisma.workflowHistory.create({
    data: { instanceId: inst5.id, toNodeId: 'start', action: 'started', performedBy: agent2.id },
  });

  console.log('  ✅ 5 workflow instances (2 running, 1 approved, 1 rejected, 1 move-in pending)');
  console.log('  ✅ 6 workflow tasks (3 pending, 2 approved, 1 rejected)');

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 1.5 — Notification Center              ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 1.5 — Notification Center');

  // ── Notification Templates ────────────────────
  const templateData = [
    { code: 'workflow_task_assigned', name: 'Workflow Task Assigned', description: 'Sent when a workflow task is assigned to a user', channels: ['in_app', 'email'], subject: 'New Task: {{taskTitle}}', bodyText: 'You have a new approval task "{{taskTitle}}" for {{entityType}}. {{workflowName}} requires your attention.', bodyPush: 'New task: {{taskTitle}}', isCritical: false, variables: [{ name: 'taskTitle', type: 'string', required: true }, { name: 'entityType', type: 'string', required: true }, { name: 'workflowName', type: 'string', required: true }] },
    { code: 'workflow_completed', name: 'Workflow Completed', description: 'Sent when a workflow instance completes successfully', channels: ['in_app', 'email'], subject: 'Workflow Approved: {{workflowName}}', bodyText: '{{workflowName}} for {{entityType}} has been approved. {{message}}', bodyPush: '✅ {{workflowName}} approved', isCritical: false, variables: [{ name: 'workflowName', type: 'string', required: true }, { name: 'entityType', type: 'string', required: true }, { name: 'message', type: 'string', required: false }] },
    { code: 'workflow_rejected', name: 'Workflow Rejected', description: 'Sent when a workflow is rejected', channels: ['in_app', 'email'], subject: 'Workflow Rejected: {{workflowName}}', bodyText: '{{workflowName}} for {{entityType}} was rejected. Reason: {{reason}}', bodyPush: '❌ {{workflowName}} rejected', isCritical: true, variables: [{ name: 'workflowName', type: 'string', required: true }, { name: 'reason', type: 'string', required: false }] },
    { code: 'lease_expiry_reminder', name: 'Lease Expiry Reminder', description: 'Reminder sent before a lease expires', channels: ['in_app', 'email'], subject: 'Lease Expiry: {{leaseNumber}} expires in {{daysLeft}} days', bodyText: 'Lease {{leaseNumber}} for tenant {{tenantName}} at unit {{unitCode}} expires on {{expiryDate}}. {{daysLeft}} days remaining.', bodyPush: '⏰ Lease {{leaseNumber}} expires in {{daysLeft}} days', isCritical: true, variables: [{ name: 'leaseNumber', type: 'string', required: true }, { name: 'tenantName', type: 'string', required: true }, { name: 'daysLeft', type: 'number', required: true }] },
    { code: 'kyc_status_change', name: 'KYC Status Updated', description: 'Notifies agents when tenant KYC status changes', channels: ['in_app'], subject: 'KYC Update: {{tenantName}}', bodyText: 'KYC status for {{tenantName}} changed from {{fromStatus}} to {{toStatus}}.', bodyPush: null, isCritical: false, variables: [{ name: 'tenantName', type: 'string', required: true }, { name: 'fromStatus', type: 'string', required: true }, { name: 'toStatus', type: 'string', required: true }] },
    { code: 'maintenance_dispatched', name: 'Maintenance Dispatched', description: 'Sent when a maintenance ticket is dispatched', channels: ['in_app', 'email'], subject: 'Maintenance Dispatched: {{ticketId}}', bodyText: 'Maintenance ticket {{ticketId}} has been dispatched to {{teamName}}. Priority: {{priority}}.', bodyPush: '🔧 Ticket {{ticketId}} dispatched', isCritical: false, variables: [{ name: 'ticketId', type: 'string', required: true }, { name: 'teamName', type: 'string', required: false }] },
    { code: 'tenant_welcome', name: 'Tenant Welcome', description: 'Welcome notification for new tenant move-in', channels: ['in_app', 'email'], subject: 'Welcome to {{propertyName}}!', bodyText: 'Welcome to {{propertyName}}, {{tenantName}}! Your move-in to unit {{unitCode}} is confirmed for {{moveInDate}}.', bodyPush: '🏠 Welcome to {{propertyName}}!', isCritical: false, variables: [{ name: 'propertyName', type: 'string', required: true }, { name: 'tenantName', type: 'string', required: true }] },
    { code: 'sla_breach_warning', name: 'SLA Breach Warning', description: 'Warning when a workflow task is about to breach SLA', channels: ['in_app', 'email'], subject: '⚠️ SLA Warning: {{taskTitle}}', bodyText: 'Task "{{taskTitle}}" is approaching its SLA deadline. Time remaining: {{timeLeft}}. Please take action immediately.', bodyPush: '⚠️ SLA warning: {{taskTitle}}', isCritical: true, variables: [{ name: 'taskTitle', type: 'string', required: true }, { name: 'timeLeft', type: 'string', required: true }] },
    // Maintenance templates
    { code: 'ticket_created', name: 'Maintenance Ticket Created', description: 'Sent to supervisors when a new maintenance ticket is submitted', channels: ['in_app', 'push'], subject: '🔧 New Ticket: {{ticketNumber}} — {{priority}}', bodyText: 'New maintenance ticket {{ticketNumber}} ({{priority}}): "{{title}}" at {{propertyName}}{{#if unitNumber}}, Unit {{unitNumber}}{{/if}}.', bodyPush: '🔧 {{priority}} ticket: {{title}}', isCritical: false, variables: [{ name: 'ticketNumber', type: 'string', required: true }, { name: 'title', type: 'string', required: true }, { name: 'priority', type: 'string', required: true }] },
    { code: 'work_order_assigned', name: 'Work Order Assigned', description: 'Sent to technician when a work order is assigned to them', channels: ['in_app', 'push', 'email'], subject: '🛠️ Work Order Assigned: {{woNumber}}', bodyText: 'You have been assigned work order {{woNumber}} for ticket {{ticketNumber}}: "{{title}}" at {{propertyName}}. Scheduled: {{scheduledStart}}. Priority: {{priority}}.', bodyPush: '🛠️ New WO: {{title}} ({{priority}})', isCritical: false, variables: [{ name: 'woNumber', type: 'string', required: true }, { name: 'title', type: 'string', required: true }, { name: 'priority', type: 'string', required: true }] },
    { code: 'ticket_sla_breach', name: 'SLA Breach Alert', description: 'Sent when a maintenance ticket breaches its SLA deadline', channels: ['in_app', 'email', 'push'], subject: '🚨 SLA Breach: {{ticketNumber}} — {{breachType}}', bodyText: '{{breachType}} breached for ticket {{ticketNumber}} ({{priority}}). Immediate action required.', bodyPush: '🚨 SLA breach: {{ticketNumber}}', isCritical: true, variables: [{ name: 'ticketNumber', type: 'string', required: true }, { name: 'breachType', type: 'string', required: true }, { name: 'priority', type: 'string', required: true }] },
    { code: 'ticket_escalated', name: 'Ticket Escalated', description: 'Sent when a maintenance ticket is escalated to a new person', channels: ['in_app', 'email', 'push'], subject: '⬆️ Escalated: {{ticketNumber}} — Level {{escalationLevel}}', bodyText: 'Ticket {{ticketNumber}} ({{priority}}) has been escalated to you. "{{title}}". Reason: {{reason}}.', bodyPush: '⬆️ Escalated: {{ticketNumber}} ({{priority}})', isCritical: true, variables: [{ name: 'ticketNumber', type: 'string', required: true }, { name: 'priority', type: 'string', required: true }, { name: 'reason', type: 'string', required: false }] },
    { code: 'rating_request', name: 'Rate Your Maintenance', description: 'Sent to tenant 2 hours after ticket completion to request a rating', channels: ['in_app', 'push'], subject: '⭐ How was your maintenance? — {{ticketNumber}}', bodyText: 'Hi {{tenantName}}, your maintenance request "{{title}}" at {{propertyName}} has been completed. Please take a moment to rate the service.', bodyPush: '⭐ Rate your maintenance: {{title}}', isCritical: false, variables: [{ name: 'ticketNumber', type: 'string', required: true }, { name: 'title', type: 'string', required: true }, { name: 'tenantName', type: 'string', required: true }] },
  ];

  const templates: any[] = [];
  for (const t of templateData) {
    const tpl = await prisma.notificationTemplate.upsert({
      where: { uq_template_code_company: { code: t.code, companyId: COMPANY_ID } },
      create: { companyId: COMPANY_ID, code: t.code, name: t.name, description: t.description, channels: t.channels, subject: t.subject, bodyText: t.bodyText, bodyPush: t.bodyPush, isCritical: t.isCritical, variables: t.variables as any },
      update: {},
    });
    templates.push(tpl);
  }
  console.log(`  ✅ ${templates.length} notification templates`);

  // ── In-App Notifications ──────────────────────
  const inAppData = [
    // Admin notifications (mix of read/unread)
    { userId: admin.id, title: 'New Task: Manager Approval', body: 'You have a new approval task "Manager Approval" for lease. Lease Approval Workflow requires your attention.', icon: 'git-branch', actionType: 'navigate', actionUrl: '/tasks', entityType: 'workflow_task', isRead: false, hoursAgo: 1 },
    { userId: admin.id, title: 'New Task: Director Approval', body: 'You have a new approval task "Director Approval" for lease. High-value lease ($25,000/mo) for Acme Corp requires director review.', icon: 'git-branch', actionType: 'navigate', actionUrl: '/tasks', entityType: 'workflow_task', isRead: false, hoursAgo: 3 },
    { userId: admin.id, title: 'New Task: Property Team Check', body: 'Move-in checklist for Sarah Johnson at unit MBR-08-002 requires property team verification.', icon: 'git-branch', actionType: 'navigate', actionUrl: '/tasks', entityType: 'workflow_task', isRead: false, hoursAgo: 5 },
    { userId: admin.id, title: 'Lease Expiry: LSE-2025-003', body: 'Lease LSE-2025-003 for tenant Emily Davis at unit MBR-10-001 expires on 2025-07-31. 72 days remaining.', icon: 'file-text', actionType: 'navigate', actionUrl: '/admin/leases', entityType: 'lease', isRead: false, hoursAgo: 8 },
    { userId: admin.id, title: 'KYC Update: Michael Brown', body: 'KYC status for Michael Brown changed from pending to in_review. Documents are being verified.', icon: 'user', actionType: 'navigate', actionUrl: '/admin/tenants', entityType: 'tenant', isRead: true, hoursAgo: 12 },
    { userId: admin.id, title: 'Workflow Approved: Invoice #INV-2025-0042', body: 'Invoice Approval for invoice has been approved. Q2 office supplies ($1,250) — within budget.', icon: 'dollar-sign', actionType: 'navigate', actionUrl: '/admin/workflows', entityType: 'workflow', isRead: true, hoursAgo: 24 },
    { userId: admin.id, title: 'Workflow Rejected: Lease for Risky Tenant LLC', body: 'Lease Approval Workflow for lease was rejected. Insufficient credit history. KYC incomplete.', icon: 'git-branch', actionType: 'navigate', actionUrl: '/admin/workflows', entityType: 'workflow', isRead: true, hoursAgo: 48 },
    { userId: admin.id, title: '⚠️ SLA Warning: Parking Allocation Review', body: 'Task "Parking Allocation Review" is approaching its SLA deadline. Time remaining: 2 hours. Please take action immediately.', icon: 'alert-triangle', actionType: 'navigate', actionUrl: '/tasks', entityType: 'workflow_task', isRead: true, hoursAgo: 72 },
    { userId: admin.id, title: 'New Lead: Anna Schmidt', body: 'A new high-priority lead has been captured from website. Budget: $2,000-$3,500. Interested in 2BR at Marina Bay Residences.', icon: 'target', actionType: 'navigate', actionUrl: '/admin/crm/leads', entityType: 'lead', isRead: true, hoursAgo: 96 },
    // Agent1 notifications
    { userId: agent1.id, title: 'Workflow Started: Lease Approval', body: 'Lease Approval Workflow has been initiated for Acme Corp lease. Pending manager approval.', icon: 'git-branch', actionType: 'navigate', actionUrl: '/admin/workflows', entityType: 'workflow', isRead: false, hoursAgo: 3 },
    { userId: agent1.id, title: 'Lead Assigned: Yuki Tanaka', body: 'New lead "Yuki Tanaka" assigned to you. Priority: high. Source: agent referral. Budget: $6,000-$10,000.', icon: 'target', actionType: 'navigate', actionUrl: '/admin/crm/leads', entityType: 'lead', isRead: false, hoursAgo: 16 },
    { userId: agent1.id, title: 'Viewing Scheduled', body: 'Property viewing scheduled for Anna Schmidt at Marina Bay Residences on May 22, 2025 at 2:00 PM.', icon: 'calendar', actionType: 'navigate', actionUrl: '/admin/crm/leads', entityType: 'viewing', isRead: true, hoursAgo: 20 },
    // Agent2 notifications
    { userId: agent2.id, title: 'Workflow Rejected: Lease', body: 'Your lease request for Risky Tenant LLC was rejected. Reason: Insufficient credit history.', icon: 'git-branch', actionType: 'navigate', actionUrl: '/admin/workflows', entityType: 'workflow', isRead: false, hoursAgo: 48 },
    { userId: agent2.id, title: 'New Task Delegated', body: 'Task "Finance Review" has been delegated to you by Admin for invoice INV-2025-0055.', icon: 'git-branch', actionType: 'navigate', actionUrl: '/tasks', entityType: 'workflow_task', isRead: false, hoursAgo: 6 },
    { userId: agent2.id, title: 'Move-In Checklist Started', body: 'Move-In Checklist workflow started for Sarah Johnson (unit MBR-08-002). Move-in date: June 1, 2025.', icon: 'home', actionType: 'navigate', actionUrl: '/admin/workflows', entityType: 'workflow', isRead: true, hoursAgo: 5 },
  ];

  for (const n of inAppData) {
    const createdAt = new Date(Date.now() - n.hoursAgo * 60 * 60 * 1000);
    await prisma.inAppNotification.create({
      data: {
        companyId: COMPANY_ID, userId: n.userId, title: n.title, body: n.body,
        icon: n.icon, actionType: n.actionType, actionUrl: n.actionUrl,
        entityType: n.entityType,
        isRead: n.isRead, readAt: n.isRead ? createdAt : null,
        createdAt,
      },
    });
  }
  console.log(`  ✅ ${inAppData.length} in-app notifications (${inAppData.filter(n => !n.isRead).length} unread)`);

  // ── Notification Logs ─────────────────────────
  const logData = [
    { tplCode: 'workflow_task_assigned', channel: 'in_app', recipientId: admin.id, subject: 'New Task: Manager Approval', body: 'You have a new approval task "Manager Approval" for lease.', status: 'sent', provider: 'in_app', hoursAgo: 1 },
    { tplCode: 'workflow_task_assigned', channel: 'email', recipientId: admin.id, subject: 'New Task: Manager Approval', body: 'You have a new approval task "Manager Approval" for lease.', status: 'sent', provider: 'console', hoursAgo: 1 },
    { tplCode: 'workflow_task_assigned', channel: 'in_app', recipientId: admin.id, subject: 'New Task: Director Approval', body: 'High-value lease requires director review.', status: 'sent', provider: 'in_app', hoursAgo: 3 },
    { tplCode: 'workflow_completed', channel: 'in_app', recipientId: agent2.id, subject: 'Workflow Approved: Invoice #INV-2025-0042', body: 'Invoice approval completed.', status: 'sent', provider: 'in_app', hoursAgo: 24 },
    { tplCode: 'workflow_completed', channel: 'email', recipientId: agent2.id, subject: 'Workflow Approved: Invoice #INV-2025-0042', body: 'Invoice approval completed.', status: 'sent', provider: 'console', hoursAgo: 24 },
    { tplCode: 'workflow_rejected', channel: 'in_app', recipientId: agent1.id, subject: 'Workflow Rejected: Lease for Risky Tenant LLC', body: 'Rejected — KYC incomplete.', status: 'sent', provider: 'in_app', hoursAgo: 48 },
    { tplCode: 'workflow_rejected', channel: 'email', recipientId: agent1.id, subject: 'Workflow Rejected: Lease for Risky Tenant LLC', body: 'Rejected — KYC incomplete.', status: 'failed', provider: 'console', errorMessage: 'SMTP connection timeout', hoursAgo: 48 },
    { tplCode: 'lease_expiry_reminder', channel: 'in_app', recipientId: admin.id, subject: 'Lease Expiry: LSE-2025-003', body: 'Lease expires in 72 days.', status: 'sent', provider: 'in_app', hoursAgo: 8 },
    { tplCode: 'lease_expiry_reminder', channel: 'email', recipientId: admin.id, subject: 'Lease Expiry: LSE-2025-003', body: 'Lease expires in 72 days.', status: 'sent', provider: 'console', hoursAgo: 8 },
    { tplCode: 'kyc_status_change', channel: 'in_app', recipientId: admin.id, subject: 'KYC Update: Michael Brown', body: 'KYC changed from pending to in_review.', status: 'sent', provider: 'in_app', hoursAgo: 12 },
    { tplCode: 'sla_breach_warning', channel: 'in_app', recipientId: admin.id, subject: '⚠️ SLA Warning: Parking Allocation Review', body: 'Task approaching SLA deadline.', status: 'sent', provider: 'in_app', hoursAgo: 72 },
    { tplCode: 'sla_breach_warning', channel: 'email', recipientId: admin.id, subject: '⚠️ SLA Warning: Parking Allocation Review', body: 'Task approaching SLA deadline.', status: 'queued', provider: 'console', hoursAgo: 72 },
  ];

  const tplMap = Object.fromEntries(templates.map((t: any) => [t.code, t.id]));
  for (const l of logData) {
    const sentAt = new Date(Date.now() - l.hoursAgo * 60 * 60 * 1000);
    await prisma.notificationLog.create({
      data: {
        companyId: COMPANY_ID, templateId: tplMap[l.tplCode] || null, templateCode: l.tplCode,
        channel: l.channel, recipientId: l.recipientId,
        subject: l.subject, body: l.body,
        status: l.status, provider: l.provider,
        errorMessage: (l as any).errorMessage || null,
        sentAt: l.status === 'sent' ? sentAt : null,
        createdAt: sentAt,
      },
    });
  }
  console.log(`  ✅ ${logData.length} notification logs (${logData.filter(l => l.status === 'sent').length} sent, ${logData.filter(l => l.status === 'failed').length} failed, ${logData.filter(l => l.status === 'queued').length} queued)`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 3.1 — Billing (Schedules + Invoices)  ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 3.1 — Billing Schedules, Invoices, Gate Logs');

  // First, seed system charge types (same logic as chargeTypesService.seedDefaults)
  const SYSTEM_CHARGE_TYPES = [
    { code: 'RENT',                  name: 'Rent',                 category: 'rent',    glAccountCode: '4100', isTaxable: true },
    { code: 'SERVICE_CHARGE',        name: 'Service Charge',       category: 'service', glAccountCode: '4200', isTaxable: true },
    { code: 'LATE_PAYMENT_PENALTY',  name: 'Late Payment Penalty', category: 'penalty', glAccountCode: '4500', isTaxable: false },
    { code: 'PARKING_MONTHLY',       name: 'Parking (Monthly)',    category: 'parking', glAccountCode: '4400', isTaxable: true },
    { code: 'ELECTRICITY',           name: 'Electricity',          category: 'utility', glAccountCode: '4300', isTaxable: true },
    { code: 'WATER',                 name: 'Water',                category: 'utility', glAccountCode: '4300', isTaxable: true },
    { code: 'ADMIN_FEE',             name: 'Administration Fee',   category: 'misc',    glAccountCode: '4600', isTaxable: true },
  ];

  const chargeTypes: Record<string, any> = {};
  for (const ct of SYSTEM_CHARGE_TYPES) {
    const existing = await prisma.chargeType.findFirst({ where: { code: ct.code, companyId: null } });
    if (existing) {
      chargeTypes[ct.code] = existing;
    } else {
      chargeTypes[ct.code] = await prisma.chargeType.create({ data: { ...ct, isSystem: true, companyId: null } });
    }
  }
  console.log(`  ✅ ${Object.keys(chargeTypes).length} charge types ready`);

  // ── Penalty Configuration ──
  await prisma.penaltyConfiguration.create({
    data: {
      companyId: COMPANY_ID,
      propertyId: properties[0].id,
      chargeTypeId: chargeTypes['LATE_PAYMENT_PENALTY'].id,
      gracePeriodDays: 7,
      penaltyType: 'percentage',
      penaltyValue: dec('5.0000'),
      maxPenaltyPct: dec('25.00'),
      isActive: true,
    },
  }).catch(() => {});
  console.log('  ✅ 1 penalty configuration');

  // ── Billing Schedules ──
  // Aligned with active leases: 0=Anderson, 1=Chen, 2=Wilson, 3=TechNova, 5=BrewedAwakening
  const scheduleData = [
    // Tenant 0 (John Anderson) — LS-2024-0001 — $2,500/mo rent
    { leaseIdx: 0, tenantIdx: 0, unitIdx: 0, ctCode: 'RENT', amount: '2500.00', cycle: 'monthly', day: 1, due: 7, start: '2024-07-01', end: '2026-06-30', next: '2025-06-01', invoiced: 11, desc: 'Monthly rent — Unit MBR-01-001' },
    { leaseIdx: 0, tenantIdx: 0, unitIdx: 0, ctCode: 'SERVICE_CHARGE', amount: '150.00', cycle: 'monthly', day: 1, due: 7, start: '2024-07-01', end: '2026-06-30', next: '2025-06-01', invoiced: 11, desc: 'Service charge — Unit MBR-01-001' },
    // Tenant 1 (Sarah Chen) — LS-2024-0002 — $1,800/mo rent
    { leaseIdx: 1, tenantIdx: 1, unitIdx: 1, ctCode: 'RENT', amount: '1800.00', cycle: 'monthly', day: 1, due: 7, start: '2024-09-01', end: '2025-08-31', next: '2025-06-01', invoiced: 9, desc: 'Monthly rent — Unit MBR-01-002' },
    // Tenant 6 (James Wilson) — LS-2023-0001 — $3,200/mo rent
    { leaseIdx: 2, tenantIdx: 6, unitIdx: 2, ctCode: 'RENT', amount: '3200.00', cycle: 'monthly', day: 1, due: 7, start: '2023-12-01', end: '2025-11-30', next: '2025-06-01', invoiced: 18, desc: 'Monthly rent — VIP unit MBR-01-003' },
    { leaseIdx: 2, tenantIdx: 6, unitIdx: 2, ctCode: 'PARKING_MONTHLY', amount: '150.00', cycle: 'monthly', day: 1, due: 7, start: '2024-01-01', end: '2025-11-30', next: '2025-06-01', invoiced: 17, desc: 'Parking — Slot B1-006' },
    // Tenant 7 (TechNova) — LS-2024-0003 — $8,500/mo rent
    { leaseIdx: 3, tenantIdx: 7, unitIdx: 15, ctCode: 'RENT', amount: '8500.00', cycle: 'monthly', day: 1, due: 7, start: '2024-04-01', end: '2027-03-31', next: '2025-06-01', invoiced: 14, desc: 'Office rent — Corporate lease' },
    { leaseIdx: 3, tenantIdx: 7, unitIdx: 15, ctCode: 'SERVICE_CHARGE', amount: '500.00', cycle: 'monthly', day: 1, due: 7, start: '2024-04-01', end: '2027-03-31', next: '2025-06-01', invoiced: 14, desc: 'Service charge — Office' },
    // Tenant 8 (Brewed Awakening) — LS-2024-0004 — $4,200/mo rent
    { leaseIdx: 5, tenantIdx: 8, unitIdx: 30, ctCode: 'RENT', amount: '4200.00', cycle: 'monthly', day: 1, due: 7, start: '2024-11-01', end: '2027-10-31', next: '2025-06-01', invoiced: 7, desc: 'Retail rent — F&B space' },
  ];

  const schedules: any[] = [];
  for (const s of scheduleData) {
    if (!leases[s.leaseIdx] || !tenants[s.tenantIdx]) continue;
    // For units that were createMany'd (no .id), look them up
    const unitRecord = allUnits[s.unitIdx]?.id
      ? allUnits[s.unitIdx]
      : await prisma.unit.findFirst({ where: { propertyId: leases[s.leaseIdx].propertyId }, skip: s.unitIdx, take: 1 });
    if (!unitRecord?.id) continue;

    try {
      const schedule = await prisma.billingSchedule.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: leases[s.leaseIdx].propertyId,
          unitId: unitRecord.id,
          tenantId: tenants[s.tenantIdx].id,
          leaseId: leases[s.leaseIdx].id,
          chargeTypeId: chargeTypes[s.ctCode].id,
          description: s.desc,
          amount: dec(s.amount),
          currency: 'USD',
          billingCycle: s.cycle,
          billingDay: s.day,
          paymentDueDays: s.due,
          startDate: d(s.start),
          endDate: s.end ? d(s.end) : null,
          nextBillingDate: d(s.next),
          status: 'active',
          lastInvoicedAt: d('2025-05-01'),
          invoiceCount: s.invoiced,
        },
      });
      schedules.push(schedule);
    } catch (e: any) {
      console.log(`  ⚠️  Schedule skipped: ${e.message?.slice(0, 60)}`);
    }
  }
  console.log(`  ✅ ${schedules.length} billing schedules`);

  // ── Invoices (recent 3 months: Mar, Apr, May 2025) ──
  const invoiceSeeds = [
    // John Anderson — 3 months of rent invoices
    { num: 'INV-2025-0001', tenantIdx: 0, leaseIdx: 0, unitIdx: 0, status: 'paid',    invDate: '2025-03-01', dueDate: '2025-03-08', pFrom: '2025-03-01', pTo: '2025-03-31', lines: [{ ct: 'RENT', desc: 'Monthly Rent — Mar 2025', amt: '2500.00' }, { ct: 'SERVICE_CHARGE', desc: 'Service Charge — Mar 2025', amt: '150.00' }], paidAmt: '2650.00' },
    { num: 'INV-2025-0002', tenantIdx: 0, leaseIdx: 0, unitIdx: 0, status: 'paid',    invDate: '2025-04-01', dueDate: '2025-04-08', pFrom: '2025-04-01', pTo: '2025-04-30', lines: [{ ct: 'RENT', desc: 'Monthly Rent — Apr 2025', amt: '2500.00' }, { ct: 'SERVICE_CHARGE', desc: 'Service Charge — Apr 2025', amt: '150.00' }], paidAmt: '2650.00' },
    { num: 'INV-2025-0003', tenantIdx: 0, leaseIdx: 0, unitIdx: 0, status: 'issued',  invDate: '2025-05-01', dueDate: '2025-05-08', pFrom: '2025-05-01', pTo: '2025-05-31', lines: [{ ct: 'RENT', desc: 'Monthly Rent — May 2025', amt: '2500.00' }, { ct: 'SERVICE_CHARGE', desc: 'Service Charge — May 2025', amt: '150.00' }], paidAmt: '0' },

    // Sarah Chen — 3 months
    { num: 'INV-2025-0004', tenantIdx: 1, leaseIdx: 1, unitIdx: 1, status: 'paid',    invDate: '2025-03-01', dueDate: '2025-03-08', pFrom: '2025-03-01', pTo: '2025-03-31', lines: [{ ct: 'RENT', desc: 'Monthly Rent — Mar 2025', amt: '1800.00' }], paidAmt: '1800.00' },
    { num: 'INV-2025-0005', tenantIdx: 1, leaseIdx: 1, unitIdx: 1, status: 'paid',    invDate: '2025-04-01', dueDate: '2025-04-08', pFrom: '2025-04-01', pTo: '2025-04-30', lines: [{ ct: 'RENT', desc: 'Monthly Rent — Apr 2025', amt: '1800.00' }], paidAmt: '1800.00' },
    { num: 'INV-2025-0006', tenantIdx: 1, leaseIdx: 1, unitIdx: 1, status: 'sent',    invDate: '2025-05-01', dueDate: '2025-05-08', pFrom: '2025-05-01', pTo: '2025-05-31', lines: [{ ct: 'RENT', desc: 'Monthly Rent — May 2025', amt: '1800.00' }], paidAmt: '0' },

    // James Wilson (VIP) — 3 months (rent + parking)
    { num: 'INV-2025-0007', tenantIdx: 6, leaseIdx: 2, unitIdx: 2, status: 'paid',    invDate: '2025-03-01', dueDate: '2025-03-08', pFrom: '2025-03-01', pTo: '2025-03-31', lines: [{ ct: 'RENT', desc: 'Monthly Rent — Mar 2025', amt: '3200.00' }, { ct: 'PARKING_MONTHLY', desc: 'Parking Slot B1-006 — Mar 2025', amt: '150.00' }], paidAmt: '3350.00' },
    { num: 'INV-2025-0008', tenantIdx: 6, leaseIdx: 2, unitIdx: 2, status: 'paid',    invDate: '2025-04-01', dueDate: '2025-04-08', pFrom: '2025-04-01', pTo: '2025-04-30', lines: [{ ct: 'RENT', desc: 'Monthly Rent — Apr 2025', amt: '3200.00' }, { ct: 'PARKING_MONTHLY', desc: 'Parking Slot B1-006 — Apr 2025', amt: '150.00' }], paidAmt: '3350.00' },
    { num: 'INV-2025-0009', tenantIdx: 6, leaseIdx: 2, unitIdx: 2, status: 'overdue', invDate: '2025-05-01', dueDate: '2025-05-08', pFrom: '2025-05-01', pTo: '2025-05-31', lines: [{ ct: 'RENT', desc: 'Monthly Rent — May 2025', amt: '3200.00' }, { ct: 'PARKING_MONTHLY', desc: 'Parking Slot B1-006 — May 2025', amt: '150.00' }], paidAmt: '0' },

    // TechNova (corp) — 3 months (rent + service charge)
    { num: 'INV-2025-0010', tenantIdx: 7, leaseIdx: 3, unitIdx: 15, status: 'paid',   invDate: '2025-03-01', dueDate: '2025-03-08', pFrom: '2025-03-01', pTo: '2025-03-31', lines: [{ ct: 'RENT', desc: 'Office Rent — Mar 2025', amt: '8500.00' }, { ct: 'SERVICE_CHARGE', desc: 'Service Charge — Mar 2025', amt: '500.00' }], paidAmt: '9000.00' },
    { num: 'INV-2025-0011', tenantIdx: 7, leaseIdx: 3, unitIdx: 15, status: 'paid',   invDate: '2025-04-01', dueDate: '2025-04-08', pFrom: '2025-04-01', pTo: '2025-04-30', lines: [{ ct: 'RENT', desc: 'Office Rent — Apr 2025', amt: '8500.00' }, { ct: 'SERVICE_CHARGE', desc: 'Service Charge — Apr 2025', amt: '500.00' }], paidAmt: '9000.00' },
    { num: 'INV-2025-0012', tenantIdx: 7, leaseIdx: 3, unitIdx: 15, status: 'partially_paid', invDate: '2025-05-01', dueDate: '2025-05-08', pFrom: '2025-05-01', pTo: '2025-05-31', lines: [{ ct: 'RENT', desc: 'Office Rent — May 2025', amt: '8500.00' }, { ct: 'SERVICE_CHARGE', desc: 'Service Charge — May 2025', amt: '500.00' }], paidAmt: '5000.00' },

    // Brewed Awakening (F&B) — 2 months
    { num: 'INV-2025-0013', tenantIdx: 8, leaseIdx: 5, unitIdx: 30, status: 'paid',   invDate: '2025-04-01', dueDate: '2025-04-08', pFrom: '2025-04-01', pTo: '2025-04-30', lines: [{ ct: 'RENT', desc: 'Retail Rent — Apr 2025', amt: '4200.00' }], paidAmt: '4200.00' },
    { num: 'INV-2025-0014', tenantIdx: 8, leaseIdx: 5, unitIdx: 30, status: 'issued', invDate: '2025-05-01', dueDate: '2025-05-08', pFrom: '2025-05-01', pTo: '2025-05-31', lines: [{ ct: 'RENT', desc: 'Retail Rent — May 2025', amt: '4200.00' }, { ct: 'WATER', desc: 'Water usage — May 2025', amt: '85.00' }, { ct: 'ELECTRICITY', desc: 'Electricity — May 2025', amt: '320.00' }], paidAmt: '0' },
  ];

  let invoiceCount = 0;
  const invoices: any[] = [];
  for (const inv of invoiceSeeds) {
    if (!leases[inv.leaseIdx] || !tenants[inv.tenantIdx]) continue;
    const unitRecord = allUnits[inv.unitIdx]?.id
      ? allUnits[inv.unitIdx]
      : await prisma.unit.findFirst({ where: { propertyId: leases[inv.leaseIdx].propertyId }, skip: inv.unitIdx, take: 1 });
    if (!unitRecord?.id) continue;

    let subtotal = dec('0');
    const lineCreates = inv.lines.map((line, idx) => {
      const amt = dec(line.amt);
      subtotal = new Prisma.Decimal(subtotal.add(amt).toString());
      return {
        chargeTypeId: chargeTypes[line.ct].id,
        description: line.desc,
        quantity: dec('1'),
        unitPrice: amt,
        amount: amt,
        taxRate: dec('0'),
        taxAmount: dec('0'),
        lineTotal: amt,
        periodFrom: d(inv.pFrom),
        periodTo: d(inv.pTo),
        sortOrder: idx,
      };
    });

    try {
      const invoice = await prisma.invoice.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: leases[inv.leaseIdx].propertyId,
          unitId: unitRecord.id,
          tenantId: tenants[inv.tenantIdx].id,
          leaseId: leases[inv.leaseIdx].id,
          invoiceNumber: inv.num,
          invoiceType: 'invoice',
          status: inv.status,
          invoiceDate: d(inv.invDate),
          dueDate: d(inv.dueDate),
          periodFrom: d(inv.pFrom),
          periodTo: d(inv.pTo),
          subtotal,
          taxAmount: dec('0'),
          totalAmount: subtotal,
          paidAmount: dec(inv.paidAmt),
          currency: 'USD',
          gracePeriodDays: 7,
          sentAt: ['sent', 'paid', 'partially_paid', 'overdue'].includes(inv.status) ? d(inv.invDate) : null,
          createdBy: admin.id,
          lines: { create: lineCreates },
        },
      });
      invoices.push(invoice);
      invoiceCount++;
    } catch (e: any) {
      console.log(`  ⚠️  Invoice ${inv.num} skipped: ${e.message?.slice(0, 60)}`);
    }
  }
  console.log(`  ✅ ${invoiceCount} invoices with line items`);

  // ── RFID Gate Access Logs ──
  // Simulates entry/exit events for tenant vehicles over the last 30 days
  const gateEvents: any[] = [];
  const gateIds = ['GATE-A-ENTRY', 'GATE-A-EXIT', 'GATE-B-ENTRY', 'GATE-B-EXIT'];
  const rfidTags = [
    { vehicleIdx: 0, tag: 'RFID-NY-ABC-1234', propIdx: 0 },   // John Anderson
    { vehicleIdx: 1, tag: 'RFID-SG-SBA-5678', propIdx: 0 },   // Sarah Chen
    { vehicleIdx: 2, tag: 'RFID-CA-7654321',  propIdx: 0 },   // David Martinez (Tesla)
    { vehicleIdx: 3, tag: 'RFID-AU-XYZ-999',  propIdx: 0 },   // James Wilson
    { vehicleIdx: 4, tag: 'RFID-BIZ-TN-001',  propIdx: 1 },   // TechNova
  ];

  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - dayOffset);
    const isWeekend = baseDate.getDay() === 0 || baseDate.getDay() === 6;

    for (const rfid of rfidTags) {
      if (!vehicles[rfid.vehicleIdx]) continue;
      // Skip weekends ~50% of the time for residential
      if (isWeekend && rfid.propIdx === 0 && Math.random() > 0.5) continue;

      // Morning entry (7:00-9:30 AM)
      const entryHour = 7 + Math.floor(Math.random() * 2.5);
      const entryMin = Math.floor(Math.random() * 60);
      const entryAt = new Date(baseDate);
      entryAt.setHours(entryHour, entryMin, Math.floor(Math.random() * 60));

      gateEvents.push({
        propertyId: properties[rfid.propIdx].id,
        rfidTagNo: rfid.tag,
        vehicleId: vehicles[rfid.vehicleIdx].id,
        eventType: 'entry',
        gateId: gateIds[Math.random() > 0.5 ? 0 : 2],
        eventAt: entryAt,
        isAuthorized: true,
      });

      // Evening exit (17:00-21:00)
      const exitHour = 17 + Math.floor(Math.random() * 4);
      const exitMin = Math.floor(Math.random() * 60);
      const exitAt = new Date(baseDate);
      exitAt.setHours(exitHour, exitMin, Math.floor(Math.random() * 60));

      gateEvents.push({
        propertyId: properties[rfid.propIdx].id,
        rfidTagNo: rfid.tag,
        vehicleId: vehicles[rfid.vehicleIdx].id,
        eventType: 'exit',
        gateId: gateIds[Math.random() > 0.5 ? 1 : 3],
        eventAt: exitAt,
        isAuthorized: true,
      });
    }
  }

  // Add a few unauthorized access attempts
  const denials = [
    { tag: 'RFID-UNKNOWN-001', plate: null, gate: 'GATE-A-ENTRY', propIdx: 0, daysAgo: 5, reason: 'Unregistered RFID tag' },
    { tag: 'RFID-EXPIRED-002', plate: null, gate: 'GATE-B-ENTRY', propIdx: 0, daysAgo: 12, reason: 'Allocation expired' },
    { tag: 'RFID-BLOCKED-003', plate: null, gate: 'GATE-A-ENTRY', propIdx: 1, daysAgo: 3, reason: 'Vehicle blacklisted — unpaid dues' },
    { tag: 'RFID-BLOCKED-003', plate: null, gate: 'GATE-B-ENTRY', propIdx: 1, daysAgo: 2, reason: 'Vehicle blacklisted — unpaid dues' },
  ];

  for (const denial of denials) {
    const eventAt = new Date();
    eventAt.setDate(eventAt.getDate() - denial.daysAgo);
    eventAt.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));

    gateEvents.push({
      propertyId: properties[denial.propIdx].id,
      rfidTagNo: denial.tag,
      vehicleId: null,
      eventType: 'entry',
      gateId: denial.gate,
      eventAt,
      isAuthorized: false,
      denialReason: denial.reason,
    });
  }

  // Batch insert gate events
  await prisma.rfidAccessEvent.createMany({ data: gateEvents });
  console.log(`  ✅ ${gateEvents.length} RFID gate access events (${denials.length} denied)`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 4 — run separately via seed-phase4.ts ║
  // ╚══════════════════════════════════════════════╝
  console.log('\n  ℹ️  Phase 4 data: run `npx tsx prisma/seed-phase4.ts` separately');

  // ╔══════════════════════════════════════════════╗
  // ║  DONE                                        ║
  // ╚══════════════════════════════════════════════╝
  console.log('\n═══════════════════════════════════════');
  console.log('  🎉 Full seed complete!');
  console.log('');
  console.log('  Users:');
  console.log('    admin@acmeproperty.com  / Admin@123');
  console.log('    agent1@acmeproperty.com / User@123');
  console.log('    agent2@acmeproperty.com / User@123');
  console.log('');
  console.log('  Data:');
  console.log(`    ${properties.length} properties, ${allUnits.length} units`);
  console.log(`    ${tenants.length} tenants, ${leases.length} leases`);
  console.log(`    ${leadRecords.length} CRM leads, ${campRecords.length} campaigns`);
  console.log(`    ${zones.length} zones, ${totalSlots} slots, ${allocCount} allocations`);
  console.log(`    ${wfDefRecords.length} workflow definitions, 5 instances, 6 tasks`);
  console.log(`    ${templates.length} notification templates, ${inAppData.length} notifications, ${logData.length} logs`);
  console.log(`    ${schedules.length} billing schedules, ${invoiceCount} invoices`);
  console.log(`    ${gateEvents.length} RFID gate access events`);
  console.log('═══════════════════════════════════════');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

