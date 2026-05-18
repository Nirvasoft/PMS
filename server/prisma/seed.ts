import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create default company
  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'ACME Property Group',
      legalName: 'ACME Property Group Pte Ltd',
      companyType: 'standalone',
      country: 'US',
      currency: 'USD',
      timezone: 'America/New_York',
      email: 'admin@acmeproperty.com',
      settings: {
        mallModuleEnabled: false,
        condoModuleEnabled: true,
        maxProperties: 50,
        subscriptionPlan: 'enterprise',
      },
    },
    update: {},
  });

  console.log(`  ✅ Company: ${company.name} (${company.id})`);

  // 2. Create password policy
  await prisma.passwordPolicy.upsert({
    where: { companyId: company.id },
    create: {
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
    update: {},
  });

  console.log('  ✅ Password policy created');

  // 3. Create admin user
  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const admin = await prisma.user.upsert({
    where: { uq_users_email_company: { email: 'admin@acmeproperty.com', companyId: company.id } },
    create: {
      companyId: company.id,
      email: 'admin@acmeproperty.com',
      emailVerified: true,
      passwordHash,
      isActive: true,
      mustChangePassword: false,
    },
    update: {},
  });

  console.log(`  ✅ Admin user: ${admin.email} (password: Admin@123)`);

  // 4. Create a regular test user
  const userHash = await bcrypt.hash('User@123', 12);

  const testUser = await prisma.user.upsert({
    where: { uq_users_email_company: { email: 'user@acmeproperty.com', companyId: company.id } },
    create: {
      companyId: company.id,
      email: 'user@acmeproperty.com',
      emailVerified: true,
      passwordHash: userHash,
      isActive: true,
      mustChangePassword: false,
    },
    update: {},
  });

  console.log(`  ✅ Test user: ${testUser.email} (password: User@123)`);

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
