import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ── Well-known IDs from main seed ──────────────────
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

// Deterministic UUIDs for tenants
const T = {
  john:    '10000000-0000-0000-0000-000000000001',
  sarah:   '10000000-0000-0000-0000-000000000002',
  michael: '10000000-0000-0000-0000-000000000003',
  emily:   '10000000-0000-0000-0000-000000000004',
  david:   '10000000-0000-0000-0000-000000000005',
  lisa:    '10000000-0000-0000-0000-000000000006',
  james:   '10000000-0000-0000-0000-000000000007',
  // Corporate
  techCo:  '10000000-0000-0000-0000-000000000008',
  cafeInc: '10000000-0000-0000-0000-000000000009',
  lawFirm: '10000000-0000-0000-0000-00000000000a',
};

// KYC requirement IDs
const KYC = {
  indPassport:  '20000000-0000-0000-0000-000000000001',
  indNric:      '20000000-0000-0000-0000-000000000002',
  indProofAddr: '20000000-0000-0000-0000-000000000003',
  indIncPrf:    '20000000-0000-0000-0000-000000000004',
  corpBizReg:   '20000000-0000-0000-0000-000000000005',
  corpBoardRes: '20000000-0000-0000-0000-000000000006',
  corpFinStmt:  '20000000-0000-0000-0000-000000000007',
};

// Lease IDs
const L = {
  l1: '30000000-0000-0000-0000-000000000001',
  l2: '30000000-0000-0000-0000-000000000002',
  l3: '30000000-0000-0000-0000-000000000003',
  l4: '30000000-0000-0000-0000-000000000004',
  l5: '30000000-0000-0000-0000-000000000005',
  l6: '30000000-0000-0000-0000-000000000006',
  l7: '30000000-0000-0000-0000-000000000007',
};

function date(s: string): Date {
  return new Date(s);
}

async function main() {
  console.log('🌱 Seeding tenants & related data...');

  // ── 0. Look up first admin user + first property + units ──
  const admin = await prisma.user.findFirst({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('No admin user found — run main seed first');

  const properties = await prisma.property.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 3,
  });

  if (properties.length === 0) {
    console.log('  ⚠️  No properties found — skipping lease creation. Create properties first.');
  }

  // Get some units for leases
  const units = properties.length > 0
    ? await prisma.unit.findMany({
        where: { propertyId: properties[0].id, deletedAt: null },
        orderBy: { unitNumber: 'asc' },
        take: 10,
      })
    : [];

  console.log(`  📦 Found ${properties.length} properties, ${units.length} units`);

  // ── 1. KYC Requirements ──────────────────────
  const kycReqs = [
    { id: KYC.indPassport,  tenantType: 'individual', docType: 'passport',        name: 'Passport / National ID',    description: 'Valid photo ID document', isRequired: true,  validityDays: 365 * 5, sortOrder: 1 },
    { id: KYC.indNric,      tenantType: 'individual', docType: 'nric',            name: 'NRIC / FIN',                description: 'National registration ID', isRequired: false, validityDays: null,    sortOrder: 2 },
    { id: KYC.indProofAddr, tenantType: 'individual', docType: 'proof_of_address', name: 'Proof of Address',          description: 'Utility bill or bank statement (< 3 months)', isRequired: true, validityDays: 90, sortOrder: 3 },
    { id: KYC.indIncPrf,    tenantType: 'individual', docType: 'income_proof',     name: 'Proof of Income',           description: 'Pay slips (3 months) or employment letter', isRequired: true, validityDays: 90, sortOrder: 4 },
    { id: KYC.corpBizReg,   tenantType: 'company',    docType: 'business_reg',     name: 'Business Registration',     description: 'Company registration / ACRA BizFile', isRequired: true, validityDays: 365, sortOrder: 1 },
    { id: KYC.corpBoardRes, tenantType: 'company',    docType: 'board_resolution', name: 'Board Resolution',          description: 'Authorizing signatory for lease', isRequired: true, validityDays: null, sortOrder: 2 },
    { id: KYC.corpFinStmt,  tenantType: 'company',    docType: 'financial_stmt',   name: 'Financial Statements',      description: 'Last 2 years audited accounts', isRequired: false, validityDays: 365, sortOrder: 3 },
  ];

  for (const req of kycReqs) {
    await prisma.kycRequirement.upsert({
      where: { id: req.id },
      create: { ...req, companyId: COMPANY_ID },
      update: {},
    });
  }
  console.log(`  ✅ ${kycReqs.length} KYC requirements`);

  // ── 2. Individual Tenants ────────────────────
  const individualTenants = [
    {
      id: T.john,
      firstName: 'John',        lastName: 'Anderson',
      dateOfBirth: date('1985-03-15'), gender: 'male', nationality: 'US',
      idType: 'passport',       idNumber: 'US-9283746',   idExpiryDate: date('2029-03-14'),
      email: 'john.anderson@email.com', phone: '+1-555-0101', mobile: '+1-555-0102',
      addressLine1: '45 Oak Street', city: 'New York', state: 'NY', postalCode: '10001', country: 'US',
      kycStatus: 'verified',    kycVerifiedAt: date('2024-06-01'), kycVerifiedBy: admin.id,
      source: 'walk_in',        tags: ['premium', 'long_term'],
      notes: 'Reliable tenant, always pays on time. Has been with us since 2024.',
    },
    {
      id: T.sarah,
      firstName: 'Sarah',       lastName: 'Chen',
      dateOfBirth: date('1990-07-22'), gender: 'female', nationality: 'SG',
      idType: 'nric',           idNumber: 'S9012345A',    idExpiryDate: null,
      email: 'sarah.chen@email.com', phone: '+65-8123-4567', mobile: '+65-9123-4567',
      addressLine1: '12 Orchard Road', addressLine2: '#08-15', city: 'Singapore', postalCode: '238888', country: 'SG',
      kycStatus: 'verified',    kycVerifiedAt: date('2024-08-15'), kycVerifiedBy: admin.id,
      source: 'referral',       tags: ['referral_bonus'],
      notes: 'Referred by existing tenant James Wilson.',
    },
    {
      id: T.michael,
      firstName: 'Michael',     lastName: 'Brown',
      dateOfBirth: date('1978-11-05'), gender: 'male', nationality: 'GB',
      idType: 'passport',       idNumber: 'GB-5647382',   idExpiryDate: date('2028-11-04'),
      email: 'michael.brown@email.com', phone: '+44-20-7946-0123', mobile: '+44-7911-123456',
      addressLine1: '88 Baker Street', city: 'London', state: 'Greater London', postalCode: 'NW1 6XE', country: 'GB',
      kycStatus: 'in_review',   kycVerifiedAt: null, kycVerifiedBy: null,
      source: 'agent',          tags: ['expat'],
      notes: 'Relocating from London. KYC documents submitted, pending verification.',
    },
    {
      id: T.emily,
      firstName: 'Emily',       lastName: 'Park',
      dateOfBirth: date('1995-02-28'), gender: 'female', nationality: 'KR',
      idType: 'passport',       idNumber: 'M87654321',    idExpiryDate: date('2030-02-27'),
      email: 'emily.park@email.com', phone: null, mobile: '+82-10-1234-5678',
      addressLine1: '23 Gangnam-daero', city: 'Seoul', postalCode: '06236', country: 'KR',
      kycStatus: 'pending',     kycVerifiedAt: null, kycVerifiedBy: null,
      source: 'online',         tags: ['young_professional'],
      notes: null,
    },
    {
      id: T.david,
      firstName: 'David',       lastName: 'Martinez',
      dateOfBirth: date('1982-09-10'), gender: 'male', nationality: 'US',
      idType: 'driving_license', idNumber: 'DL-CA-7654321', idExpiryDate: date('2027-09-09'),
      email: 'david.martinez@email.com', phone: '+1-555-0201', mobile: '+1-555-0202',
      addressLine1: '1250 Sunset Blvd', city: 'Los Angeles', state: 'CA', postalCode: '90026', country: 'US',
      kycStatus: 'verified',    kycVerifiedAt: date('2025-01-10'), kycVerifiedBy: admin.id,
      source: 'walk_in',        tags: [],
      notes: 'Moving in with family (2 adults, 1 child).',
    },
    {
      id: T.lisa,
      firstName: 'Lisa',        lastName: 'Nguyen',
      dateOfBirth: date('1988-12-03'), gender: 'female', nationality: 'VN',
      idType: 'passport',       idNumber: 'B12345678',    idExpiryDate: date('2028-12-02'),
      email: 'lisa.nguyen@email.com', phone: '+84-28-1234-5678', mobile: '+84-909-123456',
      addressLine1: '56 Nguyen Hue', city: 'Ho Chi Minh City', postalCode: '70000', country: 'VN',
      kycStatus: 'rejected',    kycVerifiedAt: null, kycVerifiedBy: null,
      source: 'agent',          tags: ['pending_docs'],
      notes: 'Income proof rejected — documents were expired. Re-submission requested.',
    },
    {
      id: T.james,
      firstName: 'James',       lastName: 'Wilson',
      dateOfBirth: date('1975-06-18'), gender: 'male', nationality: 'AU',
      idType: 'passport',       idNumber: 'PA-AU-4321567', idExpiryDate: date('2031-06-17'),
      email: 'james.wilson@email.com', phone: '+61-2-9876-5432', mobile: '+61-400-123-456',
      addressLine1: '789 Collins Street', city: 'Melbourne', state: 'VIC', postalCode: '3000', country: 'AU',
      kycStatus: 'verified',    kycVerifiedAt: date('2023-11-20'), kycVerifiedBy: admin.id, kycExpiryDate: date('2026-11-20'),
      source: 'referral',       tags: ['vip', 'long_term'],
      notes: 'VIP tenant — been with us 3+ years. Has referred 2 other tenants.',
    },
  ];

  for (const t of individualTenants) {
    await prisma.tenant.upsert({
      where: { id: t.id },
      create: { ...t, companyId: COMPANY_ID, tenantType: 'individual' },
      update: {},
    });
  }
  console.log(`  ✅ ${individualTenants.length} individual tenants`);

  // ── 3. Corporate Tenants ─────────────────────
  const corporateTenants = [
    {
      id: T.techCo,
      companyName: 'TechNova Solutions Pte Ltd',
      companyRegNo: '202312345K',   companyType: 'private_limited', gstRegNo: 'M2-2023-12345-6',
      email: 'leasing@technova.io', phone: '+65-6789-0123', mobile: null,
      addressLine1: '1 Marina Boulevard', addressLine2: '#28-00 One Marina', city: 'Singapore', postalCode: '018989', country: 'SG',
      contactPersonName: 'Rachel Tan', contactPersonPhone: '+65-9876-5432',
      contactPersonEmail: 'rachel.tan@technova.io', contactPersonRole: 'Office Manager',
      kycStatus: 'verified',    kycVerifiedAt: date('2024-04-01'), kycVerifiedBy: admin.id,
      source: 'agent',          tags: ['tech', 'corporate'],
      notes: 'Fast-growing tech startup. Currently 45 employees, plans to expand to 80 by Q4.',
    },
    {
      id: T.cafeInc,
      companyName: 'Brewed Awakening Café',
      companyRegNo: '53123456A',    companyType: 'sole_prop', gstRegNo: null,
      email: 'hello@brewedawakening.com', phone: '+1-555-0301', mobile: '+1-555-0302',
      addressLine1: '330 West Broadway', city: 'New York', state: 'NY', postalCode: '10013', country: 'US',
      contactPersonName: 'Maria Rodriguez', contactPersonPhone: '+1-555-0303',
      contactPersonEmail: 'maria@brewedawakening.com', contactPersonRole: 'Owner',
      kycStatus: 'verified',    kycVerifiedAt: date('2024-10-15'), kycVerifiedBy: admin.id,
      source: 'walk_in',        tags: ['retail', 'f_and_b'],
      notes: 'Specialty coffee shop. Requires ground floor unit with street frontage.',
    },
    {
      id: T.lawFirm,
      companyName: 'Harper & Cole LLP',
      companyRegNo: 'T08LL1234A',   companyType: 'partnership', gstRegNo: 'M7-2008-1234-5',
      email: 'admin@harpercole.com', phone: '+65-6234-5678', mobile: null,
      addressLine1: '80 Raffles Place', addressLine2: '#32-01', city: 'Singapore', postalCode: '048624', country: 'SG',
      contactPersonName: 'William Harper', contactPersonPhone: '+65-9111-2222',
      contactPersonEmail: 'w.harper@harpercole.com', contactPersonRole: 'Managing Partner',
      kycStatus: 'in_review',   kycVerifiedAt: null, kycVerifiedBy: null,
      source: 'online',         tags: ['legal', 'corporate', 'high_value'],
      notes: 'Major law firm looking for 3-floor office space. KYC in review.',
    },
  ];

  for (const t of corporateTenants) {
    await prisma.tenant.upsert({
      where: { id: t.id },
      create: { ...t, companyId: COMPANY_ID, tenantType: 'corporate' },
      update: {},
    });
  }
  console.log(`  ✅ ${corporateTenants.length} corporate tenants`);

  // ── 4. Emergency Contacts ────────────────────
  const emergencyContacts = [
    { tenantId: T.john,    name: 'Linda Anderson',   relationship: 'spouse',  phone: '+1-555-0103', email: 'linda.a@email.com', isPrimary: true },
    { tenantId: T.john,    name: 'Robert Anderson',  relationship: 'brother', phone: '+1-555-0104', isPrimary: false },
    { tenantId: T.sarah,   name: 'Wei Chen',         relationship: 'father',  phone: '+65-8234-5678', email: 'wei.chen@email.com', isPrimary: true },
    { tenantId: T.michael, name: 'Emma Brown',       relationship: 'wife',    phone: '+44-7911-654321', isPrimary: true },
    { tenantId: T.david,   name: 'Ana Martinez',     relationship: 'wife',    phone: '+1-555-0203', email: 'ana.m@email.com', isPrimary: true },
    { tenantId: T.james,   name: 'Karen Wilson',     relationship: 'sister',  phone: '+61-400-456-789', isPrimary: true },
    // Corporate contacts use the contactPerson fields, but we still add emergency contacts
    { tenantId: T.techCo,  name: 'John Lim',         relationship: 'CFO',     phone: '+65-9000-1111', email: 'john.lim@technova.io', isPrimary: true },
  ];

  // Clear existing emergency contacts for these tenants first
  await prisma.tenantEmergencyContact.deleteMany({
    where: { tenantId: { in: Object.values(T) } },
  });

  for (const ec of emergencyContacts) {
    await prisma.tenantEmergencyContact.create({ data: ec });
  }
  console.log(`  ✅ ${emergencyContacts.length} emergency contacts`);

  // ── 5. Tenant Notes ──────────────────────────
  const tenantNotes = [
    { tenantId: T.john,    content: 'Tenant inquired about upgrading to a larger unit (3BR). Follow up in Q3.',           isPinned: true },
    { tenantId: T.john,    content: 'Submitted maintenance request for AC unit — resolved within 2 days.',                isPinned: false },
    { tenantId: T.sarah,   content: 'Preferred communication via WhatsApp. Do not call during office hours.',             isPinned: true },
    { tenantId: T.james,   content: 'VIP tenant — always send renewal notices 3 months in advance.',                      isPinned: true },
    { tenantId: T.james,   content: 'Referred Sarah Chen (tenant ID: sarah). Applied referral discount on next renewal.', isPinned: false },
    { tenantId: T.techCo,  content: 'Company is expanding rapidly. May need additional floors by mid-2026.',              isPinned: true },
    { tenantId: T.cafeInc, content: 'Requested permission for outdoor seating area. Approved with conditions.',           isPinned: false },
    { tenantId: T.lisa,    content: 'Re-submission of income proof requested via email on 2025-04-20. Awaiting.',         isPinned: true },
    { tenantId: T.lawFirm, content: 'Preliminary meeting held. They want a 5-year lease with first right of refusal.',    isPinned: true },
  ];

  await prisma.tenantNote.deleteMany({
    where: { tenantId: { in: Object.values(T) } },
  });

  for (const note of tenantNotes) {
    await prisma.tenantNote.create({
      data: { ...note, createdBy: admin.id },
    });
  }
  console.log(`  ✅ ${tenantNotes.length} tenant notes`);

  // ── 6. Leases (only if units exist) ──────────
  if (units.length >= 5 && properties.length > 0) {
    const propId = properties[0].id;

    // Delete existing seed leases
    await prisma.lease.deleteMany({
      where: { id: { in: Object.values(L) } },
    });

    const leases = [
      {
        id: L.l1,
        tenantId: T.john,
        unitId: units[0].id,
        leaseNumber: 'LS-2024-0001',
        status: 'active',
        startDate: date('2024-07-01'),
        endDate: date('2026-06-30'),
        leaseTermMonths: 24,
        rentAmount: new Prisma.Decimal('2500.00'),
        currency: 'USD',
        billingCycle: 'monthly',
        billingDay: 1,
        paymentDueDays: 7,
        securityDeposit: new Prisma.Decimal('5000.00'),
        depositPaid: true,
        depositPaidAt: date('2024-06-25'),
        activatedAt: date('2024-07-01'),
        notes: 'Standard 2-year residential lease.',
      },
      {
        id: L.l2,
        tenantId: T.sarah,
        unitId: units[1]?.id ?? units[0].id,
        leaseNumber: 'LS-2024-0002',
        status: 'active',
        startDate: date('2024-09-01'),
        endDate: date('2025-08-31'),
        leaseTermMonths: 12,
        rentAmount: new Prisma.Decimal('1800.00'),
        currency: 'USD',
        billingCycle: 'monthly',
        billingDay: 1,
        paymentDueDays: 5,
        securityDeposit: new Prisma.Decimal('3600.00'),
        depositPaid: true,
        depositPaidAt: date('2024-08-28'),
        activatedAt: date('2024-09-01'),
        notes: 'Referral discount applied — $200/mo off standard rate.',
      },
      {
        id: L.l3,
        tenantId: T.james,
        unitId: units[2]?.id ?? units[0].id,
        leaseNumber: 'LS-2023-0001',
        status: 'active',
        startDate: date('2023-12-01'),
        endDate: date('2025-11-30'),
        leaseTermMonths: 24,
        rentAmount: new Prisma.Decimal('3200.00'),
        currency: 'USD',
        billingCycle: 'monthly',
        billingDay: 1,
        paymentDueDays: 7,
        securityDeposit: new Prisma.Decimal('6400.00'),
        depositPaid: true,
        depositPaidAt: date('2023-11-25'),
        activatedAt: date('2023-12-01'),
        escalationType: 'percentage',
        escalationValue: new Prisma.Decimal('3.0000'),
        escalationFrequency: 'annual',
        notes: 'VIP tenant. 3% annual escalation. Renewal expected.',
      },
      {
        id: L.l4,
        tenantId: T.techCo,
        unitId: units[3]?.id ?? units[0].id,
        leaseNumber: 'LS-2024-0003',
        status: 'active',
        startDate: date('2024-04-01'),
        endDate: date('2027-03-31'),
        leaseTermMonths: 36,
        rentAmount: new Prisma.Decimal('8500.00'),
        currency: 'USD',
        billingCycle: 'monthly',
        billingDay: 1,
        paymentDueDays: 14,
        securityDeposit: new Prisma.Decimal('25500.00'),
        depositPaid: true,
        depositPaidAt: date('2024-03-20'),
        activatedAt: date('2024-04-01'),
        escalationType: 'fixed',
        escalationValue: new Prisma.Decimal('500.0000'),
        escalationFrequency: 'annual',
        specialConditions: 'First right of refusal for adjacent unit. Permitted to install server racks in designated area.',
        notes: 'Corporate 3-year lease. Premium tenant.',
      },
      {
        id: L.l5,
        tenantId: T.david,
        unitId: units[4]?.id ?? units[0].id,
        leaseNumber: 'LS-2025-0001',
        status: 'draft',
        startDate: date('2025-07-01'),
        endDate: date('2026-06-30'),
        leaseTermMonths: 12,
        rentAmount: new Prisma.Decimal('2100.00'),
        currency: 'USD',
        billingCycle: 'monthly',
        billingDay: 1,
        paymentDueDays: 7,
        securityDeposit: new Prisma.Decimal('4200.00'),
        notes: 'Draft — pending tenant signature.',
      },
      {
        id: L.l6,
        tenantId: T.cafeInc,
        unitId: units.length > 5 ? units[5].id : units[0].id,
        leaseNumber: 'LS-2024-0004',
        status: 'active',
        startDate: date('2024-11-01'),
        endDate: date('2027-10-31'),
        leaseTermMonths: 36,
        rentAmount: new Prisma.Decimal('4200.00'),
        currency: 'USD',
        billingCycle: 'monthly',
        billingDay: 1,
        paymentDueDays: 10,
        securityDeposit: new Prisma.Decimal('12600.00'),
        depositPaid: true,
        depositPaidAt: date('2024-10-20'),
        activatedAt: date('2024-11-01'),
        escalationType: 'percentage',
        escalationValue: new Prisma.Decimal('5.0000'),
        escalationFrequency: 'annual',
        specialConditions: 'Tenant permitted to install commercial kitchen equipment. Must comply with fire safety code.',
        notes: 'F&B tenant. Street-facing unit with outdoor seating approved.',
      },
      {
        id: L.l7,
        tenantId: T.michael,
        unitId: units.length > 6 ? units[6].id : units[0].id,
        leaseNumber: 'LS-2024-0005',
        status: 'expired',
        startDate: date('2024-01-01'),
        endDate: date('2024-12-31'),
        leaseTermMonths: 12,
        rentAmount: new Prisma.Decimal('1950.00'),
        currency: 'USD',
        billingCycle: 'monthly',
        billingDay: 1,
        paymentDueDays: 7,
        securityDeposit: new Prisma.Decimal('3900.00'),
        depositPaid: true,
        depositPaidAt: date('2023-12-20'),
        depositRefunded: true,
        depositRefundedAt: date('2025-01-15'),
        activatedAt: date('2024-01-01'),
        notes: 'Expired — tenant relocated. Deposit refunded in full.',
      },
    ];

    for (const lease of leases) {
      await prisma.lease.upsert({
        where: { id: lease.id },
        create: {
          ...lease,
          companyId: COMPANY_ID,
          propertyId: propId,
          createdBy: admin.id,
        },
        update: {},
      });
    }
    console.log(`  ✅ ${leases.length} leases`);

    // Update unit statuses to match leases
    const activeLeaseUnitIds = leases
      .filter((l) => l.status === 'active')
      .map((l) => l.unitId);

    if (activeLeaseUnitIds.length > 0) {
      await prisma.unit.updateMany({
        where: { id: { in: activeLeaseUnitIds } },
        data: { status: 'occupied' },
      });
      console.log(`  ✅ ${activeLeaseUnitIds.length} units marked as occupied`);
    }
  } else {
    console.log('  ⚠️  Not enough units for leases — skipping lease creation');
  }

  console.log('\n🎉 Tenant seed complete!');
}

main()
  .catch((e) => {
    console.error('Tenant seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
