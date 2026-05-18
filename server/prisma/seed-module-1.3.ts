import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🏢 Seeding Module 1.3 — Organization Management...\n');

  // Get the existing company
  const company = await prisma.company.findFirst({ where: { name: 'ACME Property Group' } });
  if (!company) {
    console.error('❌ Company not found. Run Module 1.1 seed first.');
    process.exit(1);
  }

  // Update company with fuller details
  await prisma.company.update({
    where: { id: company.id },
    data: {
      legalName: 'ACME Property Holdings Pte Ltd',
      companyType: 'holding',
      registrationNo: '202400001A',
      taxId: 'T24-00001',
      industry: 'Real Estate',
      phone: '+1-555-000-1000',
      email: 'info@acmeproperty.com',
      website: 'https://acmeproperty.com',
      addressLine1: '100 Marina Boulevard',
      city: 'Singapore',
      country: 'SG',
      postalCode: '018980',
      timezone: 'Asia/Singapore',
      currency: 'USD',
      settings: {
        mallModuleEnabled: false,
        condoModuleEnabled: true,
        visitorMgmtEnabled: true,
        onlinePaymentEnabled: false,
        maxProperties: 50,
        subscriptionPlan: 'enterprise',
      },
    },
  });
  console.log('✅ Company details updated');

  // ─── Branches ──────────────────────────────
  const branches = [
    {
      name: 'Singapore HQ',
      code: 'SG-HQ',
      phone: '+65-6000-0000',
      email: 'sg@acmeproperty.com',
      addressLine1: '100 Marina Boulevard',
      city: 'Singapore',
      country: 'SG',
      postalCode: '018980',
    },
    {
      name: 'Bangkok Office',
      code: 'BK-01',
      phone: '+66-2-000-0000',
      email: 'bk@acmeproperty.com',
      addressLine1: '999 Sukhumvit Road',
      city: 'Bangkok',
      country: 'TH',
      postalCode: '10110',
    },
    {
      name: 'Yangon Office',
      code: 'YGN-01',
      phone: '+95-1-000-0000',
      email: 'ygn@acmeproperty.com',
      addressLine1: '42 Pyay Road, Dagon Township',
      city: 'Yangon',
      country: 'MM',
      postalCode: '11191',
    },
  ];

  const createdBranches: Record<string, string> = {};
  for (const b of branches) {
    const branch = await prisma.branch.upsert({
      where: { uq_branch_code_company: { code: b.code!, companyId: company.id } },
      create: { companyId: company.id, ...b },
      update: b,
    });
    createdBranches[b.code!] = branch.id;
  }
  console.log(`✅ ${branches.length} branches created`);

  // ─── Regions ───────────────────────────────
  const regions = [
    { name: 'Southeast Asia', code: 'SEA', description: 'Singapore, Thailand, Myanmar, Vietnam markets' },
    { name: 'Central District', code: 'CENTRAL', description: 'CBD and downtown properties' },
    { name: 'Suburban', code: 'SUBURBAN', description: 'Suburban residential properties' },
  ];

  const createdRegions: Record<string, string> = {};
  for (const r of regions) {
    const region = await prisma.region.upsert({
      where: { uq_region_code_company: { code: r.code!, companyId: company.id } },
      create: { companyId: company.id, ...r },
      update: r,
    });
    createdRegions[r.code!] = region.id;
  }
  console.log(`✅ ${regions.length} regions created`);

  // ─── Business Units ────────────────────────
  const businessUnits = [
    { name: 'Residential Leasing', code: 'BU-RES', branchId: createdBranches['SG-HQ'] },
    { name: 'Commercial Leasing', code: 'BU-COM', branchId: createdBranches['SG-HQ'] },
    { name: 'Maintenance & Facilities', code: 'BU-MNT', branchId: createdBranches['SG-HQ'] },
  ];

  for (const bu of businessUnits) {
    await prisma.businessUnit.upsert({
      where: { uq_bu_code_company: { code: bu.code!, companyId: company.id } },
      create: { companyId: company.id, ...bu },
      update: { name: bu.name, branchId: bu.branchId },
    });
  }
  console.log(`✅ ${businessUnits.length} business units created`);

  // ─── Properties ────────────────────────────
  const properties = [
    {
      name: 'Marina Bay Residences',
      code: 'MBR-001',
      propertyType: 'residential',
      branchId: createdBranches['SG-HQ'],
      addressLine1: '1 Marina Boulevard',
      city: 'Singapore',
      country: 'SG',
      postalCode: '018980',
      totalAreaSqft: 450000,
      yearBuilt: 2018,
      description: 'Premium waterfront condominium with 350 units across 42 floors.',
    },
    {
      name: 'Orchard Central Tower',
      code: 'OCT-001',
      propertyType: 'commercial',
      branchId: createdBranches['SG-HQ'],
      addressLine1: '200 Orchard Road',
      city: 'Singapore',
      country: 'SG',
      postalCode: '238834',
      totalAreaSqft: 320000,
      yearBuilt: 2015,
      description: 'Grade A office tower in the heart of Orchard Road shopping belt.',
    },
    {
      name: 'Sukhumvit Plaza',
      code: 'SKV-001',
      propertyType: 'mixed',
      branchId: createdBranches['BK-01'],
      addressLine1: '55 Sukhumvit Soi 24',
      city: 'Bangkok',
      country: 'TH',
      totalAreaSqft: 180000,
      yearBuilt: 2020,
      description: 'Mixed-use development with retail podium and residential tower.',
    },
    {
      name: 'Inya Lake Villas',
      code: 'ILV-001',
      propertyType: 'residential',
      branchId: createdBranches['YGN-01'],
      addressLine1: '10 Inya Road',
      city: 'Yangon',
      country: 'MM',
      totalAreaSqft: 75000,
      yearBuilt: 2022,
      description: 'Luxury villa community overlooking Inya Lake with 24 villas.',
    },
    {
      name: 'Woodlands Mall',
      code: 'WDL-001',
      propertyType: 'retail',
      branchId: createdBranches['SG-HQ'],
      addressLine1: '1 Woodlands Avenue 6',
      city: 'Singapore',
      country: 'SG',
      postalCode: '738990',
      totalAreaSqft: 210000,
      yearBuilt: 2012,
      description: 'Suburban shopping mall with 120 retail outlets and food court.',
    },
  ];

  const createdProperties: Record<string, string> = {};
  for (const p of properties) {
    const prop = await prisma.property.upsert({
      where: { uq_property_code_company: { code: p.code!, companyId: company.id } },
      create: { companyId: company.id, ...p },
      update: { name: p.name, propertyType: p.propertyType, description: p.description },
    });
    createdProperties[p.code!] = prop.id;
  }
  console.log(`✅ ${properties.length} properties created`);

  // ─── Region ↔ Property associations ────────
  const regionAssignments: [string, string[]][] = [
    ['SEA', ['MBR-001', 'OCT-001', 'SKV-001', 'ILV-001', 'WDL-001']],
    ['CENTRAL', ['MBR-001', 'OCT-001']],
    ['SUBURBAN', ['WDL-001']],
  ];

  for (const [regionCode, propCodes] of regionAssignments) {
    for (const propCode of propCodes) {
      await prisma.regionProperty.upsert({
        where: {
          regionId_propertyId: {
            regionId: createdRegions[regionCode],
            propertyId: createdProperties[propCode],
          },
        },
        create: {
          regionId: createdRegions[regionCode],
          propertyId: createdProperties[propCode],
        },
        update: {},
      });
    }
  }
  console.log('✅ Region-property assignments created');

  console.log('\n🎉 Module 1.3 seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
