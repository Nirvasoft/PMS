import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const dec = (n: string) => new Prisma.Decimal(n);
const d = (s: string) => new Date(s);

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  PMS — Phase 6 Seed (Mall + Condo)');
  console.log('═══════════════════════════════════════\n');

  // ── Lookup existing data ──
  const admin = await prisma.user.findFirst({ where: { email: 'admin@acmeproperty.com', companyId: COMPANY_ID } });
  if (!admin) throw new Error('Admin user not found. Run seed-all.ts first.');

  const allProperties = await prisma.property.findMany({ where: { companyId: COMPANY_ID }, orderBy: { code: 'asc' } });
  const propMap: Record<string, any> = {};
  for (const p of allProperties) propMap[p.code] = p;

  // Mall properties (retail type)
  const gcm = propMap['GCM']; // Grand Central Mall
  const bkg = propMap['BKG']; // Brooklyn Galleria
  const mtp = propMap['MTP']; // Midtown Plaza

  // Residential / Mixed-use for condo modules
  const mbr = propMap['MBR']; // Marina Bay Residences
  const sm  = propMap['SM'];  // Sunset Mall (mixed-use)

  if (!gcm || !bkg || !mtp) throw new Error('Mall properties not found. Run seed-all.ts first.');
  if (!mbr) throw new Error('Marina Bay Residences not found. Run seed-all.ts first.');

  // Fetch occupied units with leases for each mall property
  const gcmUnits = await prisma.unit.findMany({ where: { propertyId: gcm.id }, take: 100, orderBy: { unitNumber: 'asc' } });
  const bkgUnits = await prisma.unit.findMany({ where: { propertyId: bkg.id }, take: 100, orderBy: { unitNumber: 'asc' } });
  const mtpUnits = await prisma.unit.findMany({ where: { propertyId: mtp.id }, take: 100, orderBy: { unitNumber: 'asc' } });
  const mbrUnits = await prisma.unit.findMany({ where: { propertyId: mbr.id }, take: 50, orderBy: { unitNumber: 'asc' } });

  // Get all tenants
  const allTenants = await prisma.tenant.findMany({ where: { companyId: COMPANY_ID }, orderBy: { createdAt: 'asc' } });
  if (allTenants.length < 5) throw new Error('Need at least 5 tenants. Run seed-all.ts first.');

  // Get existing leases
  const allLeases = await prisma.lease.findMany({ where: { companyId: COMPANY_ID, status: 'active' }, include: { unit: true } });

  console.log(`  Found: ${allProperties.length} properties, ${allTenants.length} tenants, ${allLeases.length} active leases`);
  console.log(`  GCM units: ${gcmUnits.length}, BKG: ${bkgUnits.length}, MTP: ${mtpUnits.length}, MBR: ${mbrUnits.length}\n`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.1a — SHOP PROFILES                        ║
  // ╚══════════════════════════════════════════════╝
  console.log('🏪 Phase 6.1a — Shop Profiles');

  const BRANDS = [
    { brand: 'Starbucks',         category: 'F&B',           sub: 'Coffee',        anchor: false, zone: 'atrium',      franchise: 'Starbucks Corp' },
    { brand: 'H&M',              category: 'Fashion',       sub: 'Fast Fashion',  anchor: true,  zone: 'north_wing',  franchise: 'H&M Group' },
    { brand: 'Apple Store',       category: 'Electronics',   sub: 'Tech',          anchor: true,  zone: 'south_wing',  franchise: null },
    { brand: 'Sephora',          category: 'Beauty',        sub: 'Cosmetics',     anchor: false, zone: 'east_wing',   franchise: 'LVMH' },
    { brand: 'Nike',             category: 'Fashion',       sub: 'Sportswear',    anchor: true,  zone: 'west_wing',   franchise: null },
    { brand: 'Shake Shack',      category: 'F&B',           sub: 'Burgers',       anchor: false, zone: 'north_wing',  franchise: null },
    { brand: 'Zara',             category: 'Fashion',       sub: 'Fast Fashion',  anchor: true,  zone: 'south_wing',  franchise: 'Inditex' },
    { brand: 'Uniqlo',           category: 'Fashion',       sub: 'Casual',        anchor: false, zone: 'atrium',      franchise: 'Fast Retailing' },
    { brand: 'The Body Shop',    category: 'Beauty',        sub: 'Skincare',      anchor: false, zone: 'east_wing',   franchise: null },
    { brand: 'GameStop',         category: 'Entertainment', sub: 'Gaming',        anchor: false, zone: 'basement',    franchise: null },
    { brand: 'Foot Locker',      category: 'Fashion',       sub: 'Footwear',      anchor: false, zone: 'west_wing',   franchise: null },
    { brand: 'Pandora',          category: 'Fashion',       sub: 'Jewelry',       anchor: false, zone: 'atrium',      franchise: null },
    { brand: 'Subway',           category: 'F&B',           sub: 'Sandwiches',    anchor: false, zone: 'north_wing',  franchise: 'Subway IP' },
    { brand: 'AT&T Store',       category: 'Services',      sub: 'Telecom',       anchor: false, zone: 'south_wing',  franchise: null },
    { brand: 'Cineplex IMAX',    category: 'Entertainment', sub: 'Cinema',        anchor: true,  zone: 'basement',    franchise: 'Cineplex' },
    { brand: 'Chipotle',         category: 'F&B',           sub: 'Mexican',       anchor: false, zone: 'north_wing',  franchise: null },
    { brand: 'Lululemon',        category: 'Fashion',       sub: 'Activewear',    anchor: false, zone: 'east_wing',   franchise: null },
    { brand: 'GNC',              category: 'Services',      sub: 'Health',        anchor: false, zone: 'west_wing',   franchise: null },
    { brand: 'Barnes & Noble',   category: 'Other',         sub: 'Books',         anchor: true,  zone: 'atrium',      franchise: null },
    { brand: 'Panda Express',    category: 'F&B',           sub: 'Chinese',       anchor: false, zone: 'basement',    franchise: 'Panda Restaurant Group' },
  ];

  // Create shop profiles for first 20 units of each mall
  let shopCount = 0;
  for (const [units, property] of [[gcmUnits, gcm], [bkgUnits, bkg], [mtpUnits, mtp]] as const) {
    const shopUnits = (units as any[]).slice(0, 20);
    for (let i = 0; i < shopUnits.length; i++) {
      const brand = BRANDS[i % BRANDS.length];
      const unit = shopUnits[i];
      try {
        await prisma.shopProfile.upsert({
          where: { unitId: unit.id },
          create: {
            unitId: unit.id,
            companyId: COMPANY_ID,
            propertyId: (property as any).id,
            shopNumber: `${unit.unitNumber}`,
            brandName: brand.brand,
            tradeCategory: brand.category,
            tradeSubcategory: brand.sub,
            isAnchor: brand.anchor,
            shopZone: brand.zone,
            franchiseGroup: brand.franchise,
            posSystem: brand.anchor ? 'square' : ['lightspeed', 'revel', 'square', 'shopify'][i % 4],
            posStoreId: `POS-${(property as any).code}-${String(i + 1).padStart(3, '0')}`,
          },
          update: {},
        });
        shopCount++;
      } catch { /* skip duplicates */ }
    }
  }
  console.log(`  ✅ ${shopCount} shop profiles across 3 malls`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.1b — COMMERCIAL LEASES + GTO SUBMISSIONS  ║
  // ╚══════════════════════════════════════════════╝
  console.log('🏪 Phase 6.1b — Commercial Leases & GTO Submissions');

  // Create mall leases for some occupied units
  const mallLeases: any[] = [];
  const mallLeaseData = [
    { units: gcmUnits, prop: gcm, prefix: 'ML-GCM' },
    { units: bkgUnits, prop: bkg, prefix: 'ML-BKG' },
    { units: mtpUnits, prop: mtp, prefix: 'ML-MTP' },
  ];

  for (const ml of mallLeaseData) {
    const occupiedUnits = (ml.units as any[]).filter((u: any) => u.status === 'occupied').slice(0, 8);
    for (let i = 0; i < occupiedUnits.length; i++) {
      const tenant = allTenants[i % allTenants.length];
      const unit = occupiedUnits[i];
      const rent = 3000 + Math.floor(Math.random() * 5000);
      try {
        const lease = await prisma.lease.create({
          data: {
            companyId: COMPANY_ID,
            propertyId: ml.prop.id,
            tenantId: tenant.id,
            unitId: unit.id,
            leaseNumber: `${ml.prefix}-${String(i + 1).padStart(4, '0')}`,
            status: 'active',
            startDate: d('2024-01-01'),
            endDate: d('2026-12-31'),
            leaseTermMonths: 36,
            rentAmount: dec(String(rent)),
            currency: 'USD',
            billingCycle: 'monthly',
            billingDay: 1,
            paymentDueDays: 14,
            securityDeposit: dec(String(rent * 3)),
            depositPaid: true,
            depositPaidAt: d('2024-01-01'),
            activatedAt: d('2024-01-01'),
            notes: `Mall commercial lease for ${tenant.companyName || tenant.firstName + ' ' + tenant.lastName}`,
            createdBy: admin.id,
          },
        });
        mallLeases.push({ lease, unit, tenant, rent });

        // Create commercial lease extension for percentage rent
        const hasPercentage = i < 5; // first 5 have percentage rent
        await prisma.commercialLease.create({
          data: {
            leaseId: lease.id,
            companyId: COMPANY_ID,
            hasPercentageRent: hasPercentage,
            percentageRentRate: hasPercentage ? dec('0.0600') : null,
            baseRentPctThreshold: hasPercentage ? dec(String(rent * 10)) : null,
            percentageRentType: 'natural',
            gtoReportingDay: 15,
            camIncluded: true,
            camRatePerSqft: dec('2.50'),
            marketingLevyPct: dec('0.0100'),
          },
        });
      } catch (e: any) {
        // Skip if lease already exists for unit
      }
    }
  }
  console.log(`  ✅ ${mallLeases.length} commercial leases with percentage rent terms`);

  // GTO Submissions
  let gtoCount = 0;
  const months = [1, 2, 3, 4, 5]; // Jan–May 2026
  for (const ml of mallLeases.slice(0, 15)) {
    for (const month of months) {
      const gto = 20000 + Math.floor(Math.random() * 80000);
      const baseRent = ml.rent;
      const breakpoint = baseRent * 10;
      const aboveBreakpoint = Math.max(0, gto - breakpoint);
      const pctRent = aboveBreakpoint > 0 ? aboveBreakpoint * 0.06 : 0;

      try {
        await prisma.gtoSubmission.create({
          data: {
            companyId: COMPANY_ID,
            propertyId: ml.lease.propertyId,
            unitId: ml.unit.id,
            leaseId: ml.lease.id,
            tenantId: ml.tenant.id,
            submissionMonth: month,
            submissionYear: 2026,
            grossTurnover: dec(String(gto)),
            cashSales: dec(String(Math.floor(gto * 0.3))),
            cardSales: dec(String(Math.floor(gto * 0.5))),
            onlineSales: dec(String(Math.floor(gto * 0.2))),
            baseRent: dec(String(baseRent)),
            naturalBreakpoint: dec(String(breakpoint)),
            gtoAboveBreakpoint: dec(String(aboveBreakpoint)),
            percentageRent: dec(String(Math.floor(pctRent))),
            totalRentDue: dec(String(baseRent + Math.floor(pctRent))),
            verified: month <= 3,
            verifiedBy: month <= 3 ? admin.id : null,
            verifiedAt: month <= 3 ? d(`2026-0${month + 1}-20`) : null,
            submittedBy: admin.id,
            submissionMethod: 'manual',
          },
        });
        gtoCount++;
      } catch { /* skip duplicates */ }
    }
  }
  console.log(`  ✅ ${gtoCount} GTO submissions (Jan–May 2026)`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.1c — CAM COST POOLS + BILLING              ║
  // ╚══════════════════════════════════════════════╝
  console.log('🏪 Phase 6.1c — CAM Cost Pools & Billing');

  const camPools: any[] = [];
  for (const prop of [gcm, bkg, mtp]) {
    const pools = [
      { name: 'Controllable CAM', poolType: 'controllable', categories: ['cleaning', 'security', 'utilities', 'landscaping'], budget: 500000 },
      { name: 'Uncontrollable CAM', poolType: 'uncontrollable', categories: ['insurance', 'property_tax', 'management_fee'], budget: 300000 },
      { name: 'Capital Improvements', poolType: 'capital', categories: ['renovation', 'equipment', 'technology'], budget: 200000 },
    ];
    for (const pool of pools) {
      try {
        const p = await prisma.camCostPool.create({
          data: {
            companyId: COMPANY_ID,
            propertyId: prop.id,
            name: pool.name,
            poolType: pool.poolType,
            allocationBasis: 'gla',
            costCategories: pool.categories,
            year: 2026,
            budgetedAmount: dec(String(pool.budget)),
            actualAmount: dec(String(Math.floor(pool.budget * (0.3 + Math.random() * 0.4)))),
          },
        });
        camPools.push({ pool: p, propertyId: prop.id });
      } catch { /* skip duplicates */ }
    }
  }
  console.log(`  ✅ ${camPools.length} CAM cost pools`);

  // CAM Billing — for each pool, bill the first 5 occupied units
  let camBillingCount = 0;
  for (const cp of camPools.slice(0, 6)) { // first 6 pools
    const propUnits = await prisma.unit.findMany({
      where: { propertyId: cp.propertyId, status: 'occupied' },
      take: 5,
    });
    const totalGla = propUnits.reduce((s, u) => s + Number(u.areaSqft), 0);
    const poolMonthlyBudget = Number(cp.pool.budgetedAmount) / 12;

    for (const unit of propUnits) {
      const unitGla = Number(unit.areaSqft);
      const allocPct = totalGla > 0 ? unitGla / totalGla : 0.2;
      const allocated = poolMonthlyBudget * allocPct;

      // Find a lease for this unit, or use a random tenant
      const unitLease = allLeases.find(l => l.unitId === unit.id) || mallLeases.find(ml => ml.unit.id === unit.id)?.lease;
      const tenantId = unitLease ? (unitLease as any).tenantId : allTenants[0].id;

      for (const month of [1, 2, 3, 4, 5]) {
        try {
          await prisma.camBilling.create({
            data: {
              companyId: COMPANY_ID,
              propertyId: cp.propertyId,
              poolId: cp.pool.id,
              unitId: unit.id,
              tenantId,
              leaseId: unitLease?.id || null,
              billingMonth: month,
              billingYear: 2026,
              unitGlaSqft: dec(String(unitGla)),
              totalGlaSqft: dec(String(totalGla)),
              allocationPct: dec(allocPct.toFixed(6)),
              poolAmount: dec(String(Math.floor(poolMonthlyBudget))),
              allocatedAmount: dec(String(Math.floor(allocated))),
              status: month <= 3 ? 'billed' : 'pending',
            },
          });
          camBillingCount++;
        } catch { /* skip duplicates */ }
      }
    }
  }
  console.log(`  ✅ ${camBillingCount} CAM billings`);

  // CAM Reconciliation
  let reconCount = 0;
  for (const cp of camPools.slice(0, 3)) {
    const propUnits = await prisma.unit.findMany({
      where: { propertyId: cp.propertyId, status: 'occupied' },
      take: 3,
    });

    for (const unit of propUnits) {
      const estimated = 2000 + Math.floor(Math.random() * 3000);
      const actual = estimated + Math.floor((Math.random() - 0.4) * 1000);
      const unitLease = allLeases.find(l => l.unitId === unit.id) || mallLeases.find(ml => ml.unit.id === unit.id)?.lease;
      const tenantId = unitLease ? (unitLease as any).tenantId : allTenants[0].id;

      try {
        await prisma.camReconciliation.create({
          data: {
            companyId: COMPANY_ID,
            propertyId: cp.propertyId,
            poolId: cp.pool.id,
            unitId: unit.id,
            tenantId,
            reconYear: 2025,
            totalEstimated: dec(String(estimated)),
            totalActual: dec(String(actual)),
            variance: dec(String(actual - estimated)),
            status: 'finalized',
            finalizedAt: d('2026-02-15'),
          },
        });
        reconCount++;
      } catch { /* skip duplicates */ }
    }
  }
  console.log(`  ✅ ${reconCount} CAM reconciliations`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.1d — MALL EVENTS + BOOTHS                  ║
  // ╚══════════════════════════════════════════════╝
  console.log('🎪 Phase 6.1d — Mall Events & Booths');

  const eventData = [
    { prop: gcm, title: 'Summer Fashion Week 2026',    type: 'event',     category: 'Fashion',    start: '2026-06-15', end: '2026-06-22', venue: 'Grand Atrium Level 1', organizer: 'ACME Events Team', footfall: 25000, budget: 50000, status: 'planned' },
    { prop: gcm, title: 'Back-to-School Sale',          type: 'sale',      category: 'Retail',     start: '2026-08-15', end: '2026-08-31', venue: 'All Floors',            organizer: 'Marketing Dept',   footfall: 40000, budget: 15000, status: 'planned' },
    { prop: gcm, title: 'Spring Food Festival',         type: 'event',     category: 'F&B',        start: '2026-04-01', end: '2026-04-07', venue: 'Food Court Level 7',     organizer: 'GCM F&B Team',     footfall: 18000, budget: 35000, status: 'completed' },
    { prop: bkg, title: 'Brooklyn Art Walk',            type: 'exhibition', category: 'Art',        start: '2026-05-01', end: '2026-05-15', venue: 'Gallery Wing Level 3',   organizer: 'Brooklyn Arts Council', footfall: 12000, budget: 20000, status: 'active' },
    { prop: bkg, title: 'Holiday Bazaar 2026',          type: 'campaign',  category: 'Seasonal',   start: '2026-12-01', end: '2026-12-25', venue: 'Central Atrium',         organizer: 'BKG Marketing',    footfall: 60000, budget: 75000, status: 'planned' },
    { prop: mtp, title: 'Tech Expo 2026',               type: 'exhibition', category: 'Technology', start: '2026-07-10', end: '2026-07-14', venue: 'Convention Hall Level 8', organizer: 'TechEvents Inc',   footfall: 15000, budget: 45000, status: 'planned' },
    { prop: mtp, title: 'Valentine\'s Day Promo',        type: 'campaign',  category: 'Seasonal',   start: '2026-02-10', end: '2026-02-14', venue: 'Sky Garden Level 10',     organizer: 'MTP Marketing',    footfall: 30000, budget: 25000, status: 'completed' },
    { prop: mtp, title: 'Summer Music Series',          type: 'event',     category: 'Entertainment', start: '2026-06-01', end: '2026-08-30', venue: 'Rooftop Stage',        organizer: 'Live Nation',      footfall: 50000, budget: 100000, status: 'planned' },
  ];

  const events: any[] = [];
  for (const ev of eventData) {
    try {
      const event = await prisma.mallEvent.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: ev.prop.id,
          title: ev.title,
          eventType: ev.type,
          category: ev.category,
          startDate: d(ev.start),
          endDate: d(ev.end),
          venue: ev.venue,
          organizer: ev.organizer,
          estimatedFootfall: ev.footfall,
          actualFootfall: ev.status === 'completed' ? Math.floor(ev.footfall * (0.8 + Math.random() * 0.4)) : null,
          budget: dec(String(ev.budget)),
          actualCost: ev.status === 'completed' ? dec(String(Math.floor(ev.budget * (0.85 + Math.random() * 0.3)))) : null,
          status: ev.status,
          isPublic: true,
          createdBy: admin.id,
        },
      });
      events.push(event);
    } catch { /* skip */ }
  }
  console.log(`  ✅ ${events.length} mall events`);

  // Booths for events
  let boothCount = 0;
  for (const event of events.slice(0, 4)) {
    const boothsPerEvent = 4 + Math.floor(Math.random() * 4);
    for (let b = 0; b < boothsPerEvent; b++) {
      const dailyRate = 200 + Math.floor(Math.random() * 500);
      const days = 5;
      try {
        await prisma.boothRental.create({
          data: {
            eventId: event.id,
            companyId: COMPANY_ID,
            propertyId: event.propertyId,
            boothNumber: `B-${String(b + 1).padStart(2, '0')}`,
            boothLocation: ['Entrance', 'Center', 'Wing A', 'Wing B', 'Near Escalator', 'Corner'][b % 6],
            sizeSqft: dec(String(50 + b * 25)),
            brandName: BRANDS[b % BRANDS.length].brand,
            tenantId: allTenants[b % allTenants.length].id,
            startDate: event.startDate,
            endDate: event.endDate,
            dailyRate: dec(String(dailyRate)),
            totalAmount: dec(String(dailyRate * days)),
            deposit: dec(String(dailyRate)),
            status: event.status === 'completed' ? 'completed' : 'confirmed',
          },
        });
        boothCount++;
      } catch { /* skip */ }
    }
  }
  console.log(`  ✅ ${boothCount} booth rentals`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.1e — FOOTFALL SENSORS                      ║
  // ╚══════════════════════════════════════════════╝
  console.log('📡 Phase 6.1e — Footfall Sensors');

  const sensorData = [
    { prop: gcm, sensors: [
      { sensorId: 'GCM-ENT-001', name: 'Main Entrance', location: 'Level 1 Main Door', zone: 'atrium', floor: '1' },
      { sensorId: 'GCM-ENT-002', name: 'South Entrance', location: 'Level 1 South',   zone: 'south_wing', floor: '1' },
      { sensorId: 'GCM-ESC-001', name: 'Escalator L2',    location: 'Level 2 Escalator', zone: 'atrium', floor: '2' },
      { sensorId: 'GCM-FC-001',  name: 'Food Court',      location: 'Level 7 Food Court', zone: 'north_wing', floor: '7' },
    ]},
    { prop: bkg, sensors: [
      { sensorId: 'BKG-ENT-001', name: 'Atlantic Entrance', location: 'Ground Level', zone: 'atrium', floor: '1' },
      { sensorId: 'BKG-ENT-002', name: 'Parking Entrance',  location: 'B1 Connector',  zone: 'basement', floor: 'B1' },
      { sensorId: 'BKG-ART-001', name: 'Art Gallery Zone',   location: 'Level 3',       zone: 'east_wing', floor: '3' },
    ]},
    { prop: mtp, sensors: [
      { sensorId: 'MTP-ENT-001', name: 'Main Plaza Entry', location: '7th Ave Entrance', zone: 'atrium', floor: '1' },
      { sensorId: 'MTP-ENT-002', name: 'Subway Connector', location: 'B1 Transit Hub',    zone: 'basement', floor: 'B1' },
      { sensorId: 'MTP-SKY-001', name: 'Sky Garden',       location: 'Level 10',           zone: 'atrium', floor: '10' },
    ]},
  ];

  let sensorCount = 0;
  for (const sd of sensorData) {
    for (const s of sd.sensors) {
      try {
        await prisma.footfallSensor.create({
          data: {
            companyId: COMPANY_ID,
            propertyId: sd.prop.id,
            sensorId: s.sensorId,
            name: s.name,
            location: s.location,
            zone: s.zone,
            floor: s.floor,
            sensorType: 'stereo',
            vendor: 'ShopperTrak',
            isActive: true,
          },
        });
        sensorCount++;
      } catch { /* skip */ }
    }
  }
  console.log(`  ✅ ${sensorCount} footfall sensors`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.2a — UTILITY METERS + SMART METER DEVICES  ║
  // ╚══════════════════════════════════════════════╝
  console.log('⚡ Phase 6.2a — Smart Meters & Readings');

  const meterTypes: Array<{ type: string; unit: string; serial: string }> = [
    { type: 'electricity', unit: 'kWh', serial: 'ELEC' },
    { type: 'water',       unit: 'm3',  serial: 'WTR' },
    { type: 'gas',         unit: 'm3',  serial: 'GAS' },
  ];

  // Create meters for first 8 MBR units
  const metersCreated: any[] = [];
  const mbrMeterUnits = mbrUnits.slice(0, 8);
  for (const unit of mbrMeterUnits) {
    for (const mt of meterTypes.slice(0, 2)) { // electricity + water
      try {
        const meter = await prisma.utilityMeter.create({
          data: {
            unitId: unit.id,
            propertyId: mbr.id,
            companyId: COMPANY_ID,
            meterType: mt.type,
            meterSerialNo: `${mt.serial}-MBR-${unit.unitNumber.slice(-5)}`,
            meterProvider: mt.type === 'electricity' ? 'Con Edison' : 'NYC Water',
            location: `Unit ${unit.unitNumber}`,
            isSmartMeter: true,
            isActive: true,
            installedAt: d('2024-01-15'),
          },
        });
        metersCreated.push({ meter, unit, type: mt });
      } catch { /* skip duplicates */ }
    }
  }
  console.log(`  ✅ ${metersCreated.length} utility meters`);

  // Smart Meter Devices
  let deviceCount = 0;
  for (const mc of metersCreated) {
    const isOnline = Math.random() > 0.2; // 80% online
    try {
      await prisma.smartMeterDevice.create({
        data: {
          companyId: COMPANY_ID,
          meterId: mc.meter.id,
          propertyId: mbr.id,
          protocol: mc.type.type === 'electricity' ? 'modbus_tcp' : 'mqtt',
          host: isOnline ? '192.168.1.' + (10 + deviceCount) : null,
          port: mc.type.type === 'electricity' ? 502 : 1883,
          mqttTopic: mc.type.type === 'water' ? `meters/${mc.meter.meterSerialNo}/reading` : null,
          pollingIntervalMinutes: 15,
          lastPolledAt: isOnline ? new Date() : null,
          lastReadingAt: isOnline ? new Date() : null,
          connectionStatus: isOnline ? 'online' : (Math.random() > 0.5 ? 'offline' : 'error'),
          errorMessage: !isOnline ? 'Connection timeout after 3 retries' : null,
        },
      });
      deviceCount++;
    } catch { /* skip duplicates */ }
  }
  console.log(`  ✅ ${deviceCount} smart meter devices`);

  // Smart Meter Readings
  let readingCount = 0;
  for (const mc of metersCreated.slice(0, 10)) {
    let baseReading = mc.type.type === 'electricity' ? 1000 : 50;
    for (let month = 1; month <= 5; month++) {
      const consumption = mc.type.type === 'electricity' ? 200 + Math.floor(Math.random() * 150) : 8 + Math.floor(Math.random() * 10);
      baseReading += consumption;
      try {
        await prisma.smartMeterReading.create({
          data: {
            companyId: COMPANY_ID,
            meterId: mc.meter.id,
            unitId: mc.unit.id,
            propertyId: mbr.id,
            readingValue: dec(String(baseReading)),
            readingUnit: mc.type.unit,
            readingAt: d(`2026-${String(month).padStart(2, '0')}-01`),
            source: 'smart_meter',
            consumption: dec(String(consumption)),
            billingTriggered: month <= 3,
          },
        });
        readingCount++;
      } catch { /* skip */ }
    }
  }
  console.log(`  ✅ ${readingCount} meter readings`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.2b — FUND ACCOUNTS + TRANSACTIONS          ║
  // ╚══════════════════════════════════════════════╝
  console.log('💰 Phase 6.2b — Fund Accounts & Transactions');

  const fundData = [
    { prop: mbr, type: 'sinking_fund',     name: '2026 Sinking Fund',     opening: 250000 },
    { prop: mbr, type: 'management_fund',   name: '2026 Management Fund',   opening: 120000 },
    { prop: mbr, type: 'reserve_fund',      name: '2026 Reserve Fund',      opening: 500000 },
  ];

  const funds: any[] = [];
  for (const f of fundData) {
    try {
      const fund = await prisma.fundAccount.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: f.prop.id,
          fundType: f.type,
          name: f.name,
          openingBalance: dec(String(f.opening)),
          currentBalance: dec(String(f.opening)),
          currency: 'USD',
          fiscalYear: 2026,
          isActive: true,
        },
      });
      funds.push(fund);
    } catch { /* skip duplicates */ }
  }
  console.log(`  ✅ ${funds.length} fund accounts`);

  // Fund Transactions
  const txnTemplates = [
    { type: 'contribution', desc: 'Monthly unit contribution — January',  amount: 15000, date: '2026-01-05' },
    { type: 'contribution', desc: 'Monthly unit contribution — February', amount: 15000, date: '2026-02-05' },
    { type: 'contribution', desc: 'Monthly unit contribution — March',    amount: 15000, date: '2026-03-05' },
    { type: 'contribution', desc: 'Monthly unit contribution — April',    amount: 15000, date: '2026-04-05' },
    { type: 'contribution', desc: 'Monthly unit contribution — May',      amount: 15000, date: '2026-05-05' },
    { type: 'expenditure',  desc: 'Elevator modernization Phase 1',       amount: 45000, date: '2026-02-20' },
    { type: 'expenditure',  desc: 'Facade painting contractor',           amount: 28000, date: '2026-03-10' },
    { type: 'expenditure',  desc: 'Fire alarm system upgrade',            amount: 12000, date: '2026-04-15' },
    { type: 'interest',     desc: 'Q1 bank interest',                     amount: 1250,  date: '2026-04-01' },
    { type: 'expenditure',  desc: 'Plumbing repairs — 3rd floor',         amount: 4500,  date: '2026-05-02' },
  ];

  let txnCount = 0;
  for (const fund of funds) {
    let balance = Number(fund.openingBalance);
    for (const txn of txnTemplates) {
      if (txn.type === 'contribution' || txn.type === 'interest') {
        balance += txn.amount;
      } else {
        balance -= txn.amount;
      }
      try {
        await prisma.fundTransaction.create({
          data: {
            companyId: COMPANY_ID,
            fundAccountId: fund.id,
            transactionType: txn.type,
            amount: dec(String(txn.amount)),
            description: txn.desc,
            transactionDate: d(txn.date),
            createdBy: admin.id,
            notes: fund.fundType === 'sinking_fund' ? 'Approved per JMB resolution' : null,
          },
        });
        txnCount++;
      } catch { /* skip */ }
    }
    // Update fund balance
    await prisma.fundAccount.update({
      where: { id: fund.id },
      data: { currentBalance: dec(String(Math.floor(balance))) },
    });
  }
  console.log(`  ✅ ${txnCount} fund transactions`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.2c — GENERAL MEETINGS + RESOLUTIONS        ║
  // ╚══════════════════════════════════════════════╝
  console.log('🏛️ Phase 6.2c — General Meetings & Resolutions');

  const meetingData = [
    {
      type: 'AGM', title: 'Annual General Meeting 2025', year: 2025,
      scheduledAt: '2025-06-15T10:00:00Z', venue: 'Marina Bay Clubhouse',
      status: 'completed', quorum: 30, attendees: 45, quorumMet: true,
      agenda: ['Welcome & Opening', 'Audited Financial Statements FY2024', 'Appointment of Auditors', 'Sinking Fund Budget 2025', 'Election of Committee Members', 'AOB'],
      resolutions: [
        { no: 1, title: 'Adoption of Audited Financial Statements FY2024', type: 'ordinary', votesFor: 38, votesAgainst: 3, votesAbstain: 4, result: 'passed' },
        { no: 2, title: 'Appointment of Ernst & Young as Auditors', type: 'ordinary', votesFor: 40, votesAgainst: 2, votesAbstain: 3, result: 'passed' },
        { no: 3, title: 'Approval of Sinking Fund Budget $180,000', type: 'special', votesFor: 35, votesAgainst: 5, votesAbstain: 5, result: 'passed' },
        { no: 4, title: 'Installation of EV Charging Stations', type: 'ordinary', votesFor: 28, votesAgainst: 12, votesAbstain: 5, result: 'passed' },
      ],
    },
    {
      type: 'EGM', title: 'Emergency General Meeting — Lift Upgrade', year: 2026,
      scheduledAt: '2026-03-20T14:00:00Z', venue: 'Marina Bay Function Room',
      status: 'completed', quorum: 30, attendees: 52, quorumMet: true,
      agenda: ['Emergency Item: Lift Modernization', 'Funding Approval', 'Contractor Selection'],
      resolutions: [
        { no: 1, title: 'Approval of Lift Modernization Project ($95,000)', type: 'special', votesFor: 42, votesAgainst: 8, votesAbstain: 2, result: 'passed' },
        { no: 2, title: 'Appointment of OtisKone as Contractor', type: 'ordinary', votesFor: 35, votesAgainst: 10, votesAbstain: 7, result: 'passed' },
      ],
    },
    {
      type: 'AGM', title: 'Annual General Meeting 2026', year: 2026,
      scheduledAt: '2026-06-20T10:00:00Z', venue: 'Marina Bay Clubhouse',
      status: 'planned', quorum: 30, attendees: null, quorumMet: null,
      agenda: ['Welcome & Opening', 'Audited Financial Statements FY2025', 'Sinking Fund Budget 2026', 'Solar Panel Installation Proposal', 'Election of Committee Members', 'AOB'],
      resolutions: [],
    },
  ];

  const meetings: any[] = [];
  for (const m of meetingData) {
    try {
      const meeting = await prisma.generalMeeting.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: mbr.id,
          meetingType: m.type,
          title: m.title,
          fiscalYear: m.year,
          scheduledAt: d(m.scheduledAt),
          venue: m.venue,
          quorumPercentage: dec(String(m.quorum)),
          noticeDaysRequired: 14,
          status: m.status,
          agenda: m.agenda,
          actualAttendees: m.attendees,
          quorumMet: m.quorumMet,
          createdBy: admin.id,
        },
      });
      meetings.push(meeting);

      for (const res of m.resolutions) {
        await prisma.meetingResolution.create({
          data: {
            companyId: COMPANY_ID,
            meetingId: meeting.id,
            resolutionNo: res.no,
            title: res.title,
            resolutionType: res.type,
            votesFor: res.votesFor,
            votesAgainst: res.votesAgainst,
            votesAbstain: res.votesAbstain,
            totalVotes: res.votesFor + res.votesAgainst + res.votesAbstain,
            result: res.result,
            passedAt: res.result === 'passed' ? d(m.scheduledAt) : null,
          },
        });
      }
    } catch { /* skip */ }
  }
  console.log(`  ✅ ${meetings.length} meetings with resolutions`);

  // Proxies for completed meetings
  let proxyCount = 0;
  for (const meeting of meetings.slice(0, 2)) {
    const proxyUnits = mbrUnits.slice(10, 14); // units 10-13
    for (const unit of proxyUnits) {
      try {
        await prisma.meetingProxy.create({
          data: {
            companyId: COMPANY_ID,
            meetingId: meeting.id,
            unitId: unit.id,
            ownerName: `Owner of ${unit.unitNumber}`,
            proxyName: 'James Wilson',
            proxyIdNumber: 'PA-AU-4321567',
            isValid: true,
          },
        });
        proxyCount++;
      } catch { /* skip */ }
    }
  }
  console.log(`  ✅ ${proxyCount} meeting proxies`);

  // ╔══════════════════════════════════════════════╗
  // ║  6.2d — BYLAWS + VIOLATIONS                   ║
  // ╚══════════════════════════════════════════════╝
  console.log('📜 Phase 6.2d — By-Laws & Violations');

  const bylawData = [
    { no: 'BL-2024-001', title: 'Noise Restriction Hours',        category: 'noise',       content: 'All residents must observe quiet hours from 10:00 PM to 7:00 AM daily. Construction and renovation noise is prohibited on Sundays and public holidays.', date: '2024-01-01' },
    { no: 'BL-2024-002', title: 'Pet Ownership Policy',           category: 'pets',        content: 'Pets are allowed subject to registration. Maximum 2 pets per unit. Dogs must be leashed in common areas. Pet owners are responsible for all damages.', date: '2024-01-01' },
    { no: 'BL-2024-003', title: 'Parking Regulations',            category: 'parking',     content: 'Each unit is allocated 1 parking bay. Visitor parking is available on B1. No commercial vehicles allowed overnight. Double-parking is strictly prohibited.', date: '2024-01-01' },
    { no: 'BL-2024-004', title: 'Renovation Guidelines',          category: 'renovation',  content: 'All renovations require prior approval. Works permitted Mon-Sat 9AM-5PM only. Debris must be cleared within 24 hours. Renovation deposit of $2,000 required.', date: '2024-01-01' },
    { no: 'BL-2024-005', title: 'Common Area Usage',              category: 'common_area', content: 'Common areas must be kept clean. No personal belongings in corridors. BBQ area must be booked 48 hours in advance. Maximum 20 guests for facility bookings.', date: '2024-01-01' },
    { no: 'BL-2025-001', title: 'Short-Term Rental Prohibition',  category: 'common_area', content: 'Units shall not be used for short-term rentals (less than 6 months). Airbnb and similar platforms are strictly prohibited. Violations subject to fine of $5,000.', date: '2025-01-01' },
  ];

  const bylaws: any[] = [];
  for (const bl of bylawData) {
    try {
      const bylaw = await prisma.bylaw.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: mbr.id,
          bylawNo: bl.no,
          title: bl.title,
          content: bl.content,
          category: bl.category,
          effectiveDate: d(bl.date),
          isActive: true,
          createdBy: admin.id,
        },
      });
      bylaws.push(bylaw);
    } catch { /* skip duplicates */ }
  }
  console.log(`  ✅ ${bylaws.length} by-laws`);

  // Violations
  const violationData = [
    { bylawIdx: 0, unitIdx: 2, severity: 'warning', status: 'warned',   desc: 'Loud music reported at 11:30 PM on Saturday. Multiple neighbors complained.',           fine: 0,    warnedAt: '2026-01-15' },
    { bylawIdx: 0, unitIdx: 5, severity: 'minor',   status: 'fined',    desc: 'Construction noise during quiet hours (Sunday morning). Contractor was drilling.',      fine: 500,  warnedAt: '2026-02-10' },
    { bylawIdx: 1, unitIdx: 8, severity: 'warning', status: 'resolved', desc: 'Unregistered dog found in lobby without leash. Owner reminded of pet policy.',           fine: 0,    warnedAt: '2026-01-20' },
    { bylawIdx: 2, unitIdx: 3, severity: 'minor',   status: 'open',     desc: 'Commercial van parked in residential bay overnight for 3 consecutive days.',              fine: 0,    warnedAt: null },
    { bylawIdx: 3, unitIdx: 12, severity: 'major',  status: 'fined',    desc: 'Unauthorized renovation — wall knocked down without approval. Structural concern raised.', fine: 2000, warnedAt: '2026-03-01' },
    { bylawIdx: 4, unitIdx: 7, severity: 'warning', status: 'warned',   desc: 'Personal bicycle stored in emergency stairwell, blocking fire exit.',                    fine: 0,    warnedAt: '2026-04-05' },
    { bylawIdx: 5, unitIdx: 15, severity: 'major',  status: 'appealing', desc: 'Unit found listed on Airbnb for short-term rental. Tenant claims subletting with consent.', fine: 5000, warnedAt: '2026-03-15' },
    { bylawIdx: 0, unitIdx: 20, severity: 'minor',  status: 'closed',   desc: 'Party noise complaint from unit below. Resolved after management warning.',               fine: 250,  warnedAt: '2026-02-28' },
  ];

  let violationCount = 0;
  for (let i = 0; i < violationData.length; i++) {
    const v = violationData[i];
    if (!bylaws[v.bylawIdx] || !mbrUnits[v.unitIdx]) continue;
    try {
      await prisma.bylawViolation.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: mbr.id,
          bylawId: bylaws[v.bylawIdx].id,
          unitId: mbrUnits[v.unitIdx].id,
          violationNo: `VIO-2026-${String(i + 1).padStart(4, '0')}`,
          description: v.desc,
          severity: v.severity,
          status: v.status,
          fineAmount: dec(String(v.fine)),
          warnedAt: v.warnedAt ? d(v.warnedAt) : null,
          resolvedAt: v.status === 'resolved' || v.status === 'closed' ? d('2026-04-01') : null,
          resolutionNotes: v.status === 'resolved' ? 'Owner registered pet and apologized' : v.status === 'closed' ? 'Fine paid, no repeat offense' : null,
          reportedBy: admin.id,
        },
      });
      violationCount++;
    } catch { /* skip */ }
  }
  console.log(`  ✅ ${violationCount} violations`);

  // ╔══════════════════════════════════════════════╗
  // ║  DONE                                        ║
  // ╚══════════════════════════════════════════════╝
  console.log('\n═══════════════════════════════════════');
  console.log('  🎉 Phase 6 seed complete!');
  console.log('');
  console.log('  Mall (6.1):');
  console.log(`    ${shopCount} shop profiles, ${mallLeases.length} commercial leases`);
  console.log(`    ${gtoCount} GTO submissions, ${camPools.length} CAM pools`);
  console.log(`    ${camBillingCount} CAM billings, ${reconCount} reconciliations`);
  console.log(`    ${events.length} events, ${boothCount} booths, ${sensorCount} sensors`);
  console.log('');
  console.log('  Condo (6.2):');
  console.log(`    ${metersCreated.length} meters, ${deviceCount} devices, ${readingCount} readings`);
  console.log(`    ${funds.length} fund accounts, ${txnCount} transactions`);
  console.log(`    ${meetings.length} meetings, ${proxyCount} proxies`);
  console.log(`    ${bylaws.length} by-laws, ${violationCount} violations`);
  console.log('═══════════════════════════════════════');
}

main()
  .catch((e) => { console.error('❌ Phase 6 seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
