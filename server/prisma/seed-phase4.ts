import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const d = (s: string) => new Date(s);
const dec = (n: string) => new Prisma.Decimal(n);

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  PMS — Phase 4 Seed');
  console.log('═══════════════════════════════════════\n');

  // Lookup existing data
  const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@acmeproperty.com', companyId: COMPANY_ID } });
  const agentRole = await prisma.role.findFirstOrThrow({ where: { name: 'Leasing Agent', companyId: COMPANY_ID } });
  const properties = await prisma.property.findMany({ where: { companyId: COMPANY_ID }, orderBy: { createdAt: 'asc' } });

  if (properties.length < 6) {
    console.error('❌ Need at least 6 properties. Run seed-all.ts first.');
    return;
  }

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 4.1 — Maintenance Tickets & Techs     ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 4.1 — Maintenance Tickets, Technicians');

  // Maintenance Categories
  const mainCats = [
    { name: 'Plumbing', icon: '🔧', sortOrder: 1 },
    { name: 'Electrical', icon: '⚡', sortOrder: 2 },
    { name: 'HVAC', icon: '❄️', sortOrder: 3 },
    { name: 'General', icon: '🏗️', sortOrder: 4 },
    { name: 'Elevator', icon: '🛗', sortOrder: 5 },
    { name: 'Fire Safety', icon: '🔥', sortOrder: 6 },
  ];
  const catRecords: any[] = [];
  for (const c of mainCats) {
    let cat = await prisma.maintenanceCategory.findFirst({ where: { name: c.name, companyId: COMPANY_ID } });
    if (!cat) {
      cat = await prisma.maintenanceCategory.create({ data: { ...c, companyId: COMPANY_ID } });
    }
    catRecords.push(cat);
  }
  console.log(`  ✅ ${catRecords.length} maintenance categories`);

  // Technician users + profiles
  const techHash = await bcrypt.hash('Tech@123', 12);
  const techUsers: any[] = [];
  const techData = [
    { email: 'tech1@acmeproperty.com', fn: 'Carlos', ln: 'Rivera', skills: ['plumbing', 'general'], certifications: ['Licensed Plumber', 'OSHA 30'], hourlyRate: 45 },
    { email: 'tech2@acmeproperty.com', fn: 'Jake', ln: 'Thompson', skills: ['electrical', 'fire_safety'], certifications: ['Master Electrician', 'NICET Level III'], hourlyRate: 55 },
    { email: 'tech3@acmeproperty.com', fn: 'Amir', ln: 'Hassan', skills: ['hvac'], certifications: ['EPA 608 Universal', 'NATE Certified'], hourlyRate: 60 },
    { email: 'tech4@acmeproperty.com', fn: 'Priya', ln: 'Sharma', skills: ['elevator', 'general'], certifications: ['QEI Certified', 'ASME A17.1'], hourlyRate: 65 },
  ];
  for (const t of techData) {
    const user = await prisma.user.upsert({
      where: { uq_users_email_company: { email: t.email, companyId: COMPANY_ID } },
      create: { companyId: COMPANY_ID, email: t.email, emailVerified: true, passwordHash: techHash, isActive: true, mustChangePassword: false },
      update: {},
    });
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, firstName: t.fn, lastName: t.ln },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { uq_user_role: { userId: user.id, roleId: agentRole.id } },
      create: { userId: user.id, roleId: agentRole.id, grantedBy: admin.id }, update: {},
    });
    await prisma.technicianProfile.upsert({
      where: { userId: user.id },
      create: {
        companyId: COMPANY_ID, userId: user.id,
        skills: t.skills, certifications: t.certifications,
        hourlyRate: dec(String(t.hourlyRate)), isAvailable: true, maxConcurrentJobs: 3,
      },
      update: {},
    });
    techUsers.push(user);
  }
  console.log(`  ✅ ${techUsers.length} technicians (tech1-4@acmeproperty.com / Tech@123)`);

  // SLA Configs
  const slaConfigs = [
    { name: 'Critical - 2hr Response', priority: 'P1', responseHours: 2, resolutionHours: 8, escalationContactId: admin.id },
    { name: 'High - 4hr Response', priority: 'P2', responseHours: 4, resolutionHours: 24, escalationContactId: admin.id },
    { name: 'Medium - 24hr Response', priority: 'P3', responseHours: 24, resolutionHours: 72 },
    { name: 'Low - 48hr Response', priority: 'P4', responseHours: 48, resolutionHours: 168 },
  ];
  for (const sla of slaConfigs) {
    await prisma.maintenanceSlaConfig.create({
      data: { ...sla, companyId: COMPANY_ID },
    }).catch(() => {});
  }
  console.log(`  ✅ ${slaConfigs.length} SLA configurations`);

  // Maintenance Tickets
  const ticketData = [
    { title: 'Leaking pipe in bathroom', description: 'Water dripping from ceiling pipe in unit bathroom. Causing water damage to floor.', priority: 'P2', status: 'open', catIdx: 0, propIdx: 0, techIdx: 0, daysAgo: 2 },
    { title: 'AC not cooling — Unit 06-001', description: 'Central AC system blowing warm air. Thermostat set to 72°F but room temp shows 82°F.', priority: 'P1', status: 'in_progress', catIdx: 2, propIdx: 0, techIdx: 2, daysAgo: 1 },
    { title: 'Flickering lights in lobby', description: 'Main lobby chandelier flickering intermittently. Multiple bulbs affected.', priority: 'P3', status: 'open', catIdx: 1, propIdx: 1, techIdx: 1, daysAgo: 5 },
    { title: 'Elevator B stuck on 12th floor', description: 'Passenger elevator B not responding. Stuck between floors 12 and 13.', priority: 'P1', status: 'completed', catIdx: 4, propIdx: 1, techIdx: 3, daysAgo: 8 },
    { title: 'Broken window seal — wind noise', description: 'Window seal broken in corner office. Loud wind noise during storms.', priority: 'P4', status: 'open', catIdx: 3, propIdx: 1, techIdx: null, daysAgo: 15 },
    { title: 'Fire alarm false trigger — Zone 3', description: 'Fire alarm triggered in food court area. No smoke detected. Sensor may be faulty.', priority: 'P2', status: 'completed', catIdx: 5, propIdx: 2, techIdx: 1, daysAgo: 3 },
    { title: 'Clogged drain in parking basement', description: 'Storm drain clogged in B1 parking level. Water pooling near ramp entrance.', priority: 'P3', status: 'in_progress', catIdx: 0, propIdx: 2, techIdx: 0, daysAgo: 1 },
    { title: 'HVAC compressor vibration', description: 'Unusual vibration from rooftop HVAC compressor unit #3. Needs inspection.', priority: 'P3', status: 'open', catIdx: 2, propIdx: 3, techIdx: null, daysAgo: 4 },
    { title: 'Escalator 2 emergency stop', description: 'Escalator on floor 2 triggered emergency stop. Handrail sensor issue suspected.', priority: 'P2', status: 'in_progress', catIdx: 4, propIdx: 3, techIdx: 3, daysAgo: 0 },
    { title: 'Power outage — Floor 5 east wing', description: 'Partial power outage affecting east wing on 5th floor. Circuit breaker tripped.', priority: 'P1', status: 'completed', catIdx: 1, propIdx: 4, techIdx: 1, daysAgo: 6 },
    { title: 'Water heater malfunction', description: 'Central water heater not maintaining temperature. Lukewarm water in units 10-15.', priority: 'P3', status: 'open', catIdx: 0, propIdx: 0, techIdx: null, daysAgo: 7 },
    { title: 'Parking gate motor failure', description: 'Entry gate motor not lifting boom arm. Manual operation only.', priority: 'P2', status: 'in_progress', catIdx: 3, propIdx: 5, techIdx: 0, daysAgo: 1 },
  ];

  const tickets: any[] = [];
  for (let i = 0; i < ticketData.length; i++) {
    const t = ticketData[i];
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - t.daysAgo);
    const ticketNumber = `TK-2025-${String(i + 1).padStart(5, '0')}`;

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        companyId: COMPANY_ID, ticketNumber,
        propertyId: properties[t.propIdx].id,
        categoryId: catRecords[t.catIdx].id,
        title: t.title, description: t.description,
        priority: t.priority, status: t.status,
        source: 'staff',
        reportedByUserId: admin.id,
        assignedToId: t.techIdx !== null ? techUsers[t.techIdx].id : null,
        resolvedById: t.status === 'completed' ? (t.techIdx !== null ? techUsers[t.techIdx].id : admin.id) : null,
        resolvedAt: t.status === 'completed' ? new Date() : null,
        resolutionNotes: t.status === 'completed' ? 'Issue fixed and verified by technician' : null,
        createdAt,
      },
    });
    tickets.push(ticket);
  }
  console.log(`  ✅ ${tickets.length} maintenance tickets`);

  // Work Orders for in_progress and completed tickets
  let woCount = 0;
  for (let idx = 0; idx < tickets.length; idx++) {
    const td = ticketData[idx];
    if (td.status === 'in_progress' || td.status === 'completed') {
      const startedAt = new Date(tickets[idx].createdAt.getTime() + 3600000);
      await prisma.workOrder.create({
        data: {
          companyId: COMPANY_ID,
          propertyId: properties[td.propIdx].id,
          woNumber: `WO-2025-${String(woCount + 1).padStart(5, '0')}`,
          ticketId: tickets[idx].id,
          title: `WO: ${td.title}`,
          assignedToId: td.techIdx !== null ? techUsers[td.techIdx].id : techUsers[0].id,
          description: `Work order for: ${td.title}`,
          status: td.status === 'completed' ? 'completed' : 'in_progress',
          estimatedHours: dec(String(Math.floor(Math.random() * 4) + 1)),
          actualHours: td.status === 'completed' ? dec(String(Math.floor(Math.random() * 3) + 1)) : null,
          actualStart: startedAt,
          actualEnd: td.status === 'completed' ? new Date() : null,
        },
      });
      woCount++;
    }
  }
  console.log(`  ✅ ${woCount} work orders`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 4.2 — PM Schedules                    ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 4.2 — Preventive Maintenance Schedules');

  const pmScheduleData = [
    { name: 'Monthly HVAC Filter Replacement', description: 'Replace air filters in all AHU units', frequencyType: 'monthly', priority: 'P3', propIdx: 0, catIdx: 2, techIdx: 2, estimatedHours: 4 },
    { name: 'Quarterly Elevator Inspection', description: 'Full safety inspection per ASME A17.1', frequencyType: 'quarterly', priority: 'P2', propIdx: 1, catIdx: 4, techIdx: 3, estimatedHours: 8 },
    { name: 'Weekly Fire Extinguisher Check', description: 'Visual inspection — pressure, seal, condition', frequencyType: 'weekly', priority: 'P3', propIdx: 2, catIdx: 5, techIdx: 1, estimatedHours: 2 },
    { name: 'Bi-weekly Generator Test Run', description: 'Start generator, run 30 min under load, check fuel', frequencyType: 'weekly', priority: 'P2', propIdx: 0, catIdx: 1, techIdx: 1, estimatedHours: 1 },
    { name: 'Monthly Plumbing Inspection', description: 'Check all common area plumbing — valves, pressure, leaks', frequencyType: 'monthly', priority: 'P4', propIdx: 3, catIdx: 0, techIdx: 0, estimatedHours: 6 },
    { name: 'Quarterly Escalator Maintenance', description: 'Clean steps, lubricate drive chain, check safety sensors', frequencyType: 'quarterly', priority: 'P2', propIdx: 3, catIdx: 4, techIdx: 3, estimatedHours: 5 },
    { name: 'Annual Fire System Test', description: 'Full fire alarm and sprinkler system test per NFPA 25', frequencyType: 'annual', priority: 'P1', propIdx: 4, catIdx: 5, techIdx: 1, estimatedHours: 16 },
    { name: 'Monthly Parking Gate Service', description: 'Lubricate hinges, test sensors, check motor alignment', frequencyType: 'monthly', priority: 'P3', propIdx: 5, catIdx: 3, techIdx: 0, estimatedHours: 2 },
  ];

  const pmSchedules: any[] = [];
  for (const pm of pmScheduleData) {
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + Math.floor(Math.random() * 14));
    const schedule = await prisma.pmSchedule.create({
      data: {
        companyId: COMPANY_ID,
        propertyId: properties[pm.propIdx].id,
        categoryId: catRecords[pm.catIdx].id,
        name: pm.name, description: pm.description,
        frequencyType: pm.frequencyType, priority: pm.priority,
        estimatedHours: dec(String(pm.estimatedHours)),
        assignedToId: techUsers[pm.techIdx].id,
        createdById: admin.id,
        nextDueDate: nextDue,
        status: 'active',
      },
    });
    pmSchedules.push(schedule);
  }
  console.log(`  ✅ ${pmSchedules.length} PM schedules`);

  // PM Work Orders — history
  let pmWoCount = 0;
  for (let si = 0; si < Math.min(5, pmSchedules.length); si++) {
    for (let m = 1; m <= 3; m++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() - m);
      const completedAt = new Date(dueDate.getTime() + 86400000);
      await prisma.pmWorkOrder.create({
        data: {
          companyId: COMPANY_ID, scheduleId: pmSchedules[si].id,
          dueDate,
          status: 'completed',
          completedAt, completedById: techUsers[Math.floor(Math.random() * 4)].id,
          findings: `Routine ${pmScheduleData[si].frequencyType} maintenance completed. No issues found.`,
        },
      });
      pmWoCount++;
    }
  }
  console.log(`  ✅ ${pmWoCount} PM work order records (history)`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 4.3 — Facility Assets & CAM Costs     ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 4.3 — Facility Assets, CAM Costs');

  const assetData = [
    { name: 'Carrier 30RB Chiller', assetNumber: 'AST-HVAC-001', assetType: 'hvac', make: 'Carrier', model: '30RB-200', serialNumber: 'CR-2020-45678', propIdx: 0, location: 'Rooftop', floor: 'R', purchaseCost: 125000, installationDate: '2020-06-15', warrantyExpiry: '2025-06-15', lastServicedAt: '2025-03-01', nextServiceDue: '2025-06-01', status: 'operational' },
    { name: 'Otis Gen2 Elevator A', assetNumber: 'AST-ELV-001', assetType: 'elevator', make: 'Otis', model: 'Gen2-MRL', serialNumber: 'OT-2019-12345', propIdx: 1, location: 'Lobby A', floor: 'All', purchaseCost: 250000, installationDate: '2019-01-10', warrantyExpiry: '2024-01-10', lastServicedAt: '2025-04-15', nextServiceDue: '2025-07-15', status: 'operational' },
    { name: 'Otis Gen2 Elevator B', assetNumber: 'AST-ELV-002', assetType: 'elevator', make: 'Otis', model: 'Gen2-MRL', serialNumber: 'OT-2019-12346', propIdx: 1, location: 'Lobby B', floor: 'All', purchaseCost: 250000, installationDate: '2019-01-10', warrantyExpiry: '2024-01-10', lastServicedAt: '2025-02-20', nextServiceDue: '2025-05-20', status: 'under_maintenance' },
    { name: 'Caterpillar Backup Generator', assetNumber: 'AST-GEN-001', assetType: 'generator', make: 'Caterpillar', model: 'C15-500', serialNumber: 'CAT-2021-78901', propIdx: 0, location: 'Basement B2', floor: 'B2', purchaseCost: 95000, installationDate: '2021-09-01', warrantyExpiry: '2026-09-01', lastServicedAt: '2025-04-01', nextServiceDue: '2025-07-01', status: 'operational' },
    { name: 'Honeywell Fire Alarm Panel', assetNumber: 'AST-FIRE-001', assetType: 'fire_system', make: 'Honeywell', model: 'ESSER-8000', serialNumber: 'HW-2022-33333', propIdx: 2, location: 'Security Room', floor: 'G', purchaseCost: 35000, installationDate: '2022-03-20', warrantyExpiry: '2027-03-20', lastServicedAt: '2025-01-15', nextServiceDue: '2025-04-15', status: 'operational' },
    { name: 'Daikin VRV System', assetNumber: 'AST-HVAC-002', assetType: 'hvac', make: 'Daikin', model: 'RXYQ-48', serialNumber: 'DK-2023-55555', propIdx: 3, location: 'Rooftop Level', floor: 'R', purchaseCost: 180000, installationDate: '2023-02-01', warrantyExpiry: '2028-02-01', lastServicedAt: '2025-05-01', nextServiceDue: '2025-08-01', status: 'operational' },
    { name: 'Schindler Escalator Set (4)', assetNumber: 'AST-ESC-001', assetType: 'elevator', make: 'Schindler', model: '9300AE', serialNumber: 'SC-2022-44444', propIdx: 3, location: 'Atrium', floor: '1-4', purchaseCost: 420000, installationDate: '2022-06-15', warrantyExpiry: '2027-06-15', lastServicedAt: '2025-04-20', nextServiceDue: '2025-07-20', status: 'operational' },
    { name: 'Grundfos Water Pump Set', assetNumber: 'AST-PLB-001', assetType: 'water_pump', make: 'Grundfos', model: 'CR-32-12', serialNumber: 'GF-2020-11111', propIdx: 4, location: 'Pump Room B1', floor: 'B1', purchaseCost: 28000, installationDate: '2020-11-10', warrantyExpiry: '2023-11-10', lastServicedAt: '2025-03-10', nextServiceDue: '2025-06-10', status: 'operational' },
    { name: 'KONE EcoDisc Elevators (8)', assetNumber: 'AST-ELV-003', assetType: 'elevator', make: 'KONE', model: 'EcoDisc-3000', serialNumber: 'KN-2023-99999', propIdx: 5, location: 'Tower Core', floor: 'All', purchaseCost: 1200000, installationDate: '2023-08-01', warrantyExpiry: '2028-08-01', lastServicedAt: '2025-05-10', nextServiceDue: '2025-08-10', status: 'operational' },
    { name: 'Siemens BMS Controller', assetNumber: 'AST-BMS-001', assetType: 'other', make: 'Siemens', model: 'Desigo CC', serialNumber: 'SI-2021-66666', propIdx: 5, location: 'Control Room', floor: 'B1', purchaseCost: 75000, installationDate: '2021-04-15', warrantyExpiry: '2026-04-15', lastServicedAt: '2025-02-28', nextServiceDue: '2025-05-28', status: 'operational' },
  ];

  let assetCount = 0;
  for (const a of assetData) {
    await prisma.facilityAsset.create({
      data: {
        companyId: COMPANY_ID, propertyId: properties[a.propIdx].id,
        name: a.name, assetNumber: a.assetNumber, assetType: a.assetType,
        make: a.make, model: a.model, serialNumber: a.serialNumber,
        location: a.location, floor: a.floor,
        purchaseCost: dec(String(a.purchaseCost)), installationDate: d(a.installationDate),
        warrantyExpiry: d(a.warrantyExpiry),
        lastServicedAt: d(a.lastServicedAt), nextServiceDue: d(a.nextServiceDue),
        status: a.status,
        responsiblePersonId: techUsers[assetCount % 4].id,
      },
    });
    assetCount++;
  }
  console.log(`  ✅ ${assetCount} facility assets`);

  // CAM Costs
  const camData = [
    { propIdx: 0, periodYear: 2025, periodMonth: 1, costCategory: 'utilities', amount: 12500, description: 'Lobby, corridors, parking, pool area electricity' },
    { propIdx: 0, periodYear: 2025, periodMonth: 1, costCategory: 'utilities', amount: 4200, description: 'Common area water + pool maintenance' },
    { propIdx: 0, periodYear: 2025, periodMonth: 1, costCategory: 'security', amount: 8500, description: '24/7 security guard service (3 guards)' },
    { propIdx: 0, periodYear: 2025, periodMonth: 1, costCategory: 'landscaping', amount: 3200, description: 'Garden and rooftop landscape maintenance' },
    { propIdx: 0, periodYear: 2025, periodMonth: 2, costCategory: 'utilities', amount: 13100, description: 'Winter heating increased consumption' },
    { propIdx: 0, periodYear: 2025, periodMonth: 2, costCategory: 'repairs', amount: 6800, description: 'Quarterly elevator maintenance (4 units)' },
    { propIdx: 1, periodYear: 2025, periodMonth: 1, costCategory: 'utilities', amount: 28000, description: 'Lobby, lifts, HVAC common, parking' },
    { propIdx: 1, periodYear: 2025, periodMonth: 1, costCategory: 'cleaning', amount: 15000, description: 'Daily cleaning service for all common areas' },
    { propIdx: 1, periodYear: 2025, periodMonth: 1, costCategory: 'security', amount: 22000, description: 'Security service with access control + CCTV monitoring' },
    { propIdx: 3, periodYear: 2025, periodMonth: 1, costCategory: 'utilities', amount: 85000, description: 'Mall-wide common area electricity' },
    { propIdx: 3, periodYear: 2025, periodMonth: 1, costCategory: 'repairs', amount: 45000, description: 'Central HVAC operation and maintenance' },
    { propIdx: 3, periodYear: 2025, periodMonth: 1, costCategory: 'cleaning', amount: 35000, description: 'Professional mall cleaning service' },
    { propIdx: 3, periodYear: 2025, periodMonth: 1, costCategory: 'security', amount: 42000, description: 'Security team (12 guards + control room)' },
    { propIdx: 3, periodYear: 2025, periodMonth: 2, costCategory: 'utilities', amount: 82000, description: 'Mall-wide common area electricity' },
    { propIdx: 3, periodYear: 2025, periodMonth: 2, costCategory: 'insurance', amount: 18000, description: 'Monthly property insurance premium' },
    { propIdx: 4, periodYear: 2025, periodMonth: 1, costCategory: 'utilities', amount: 72000, description: 'Common electricity — escalators, lifts, lighting' },
    { propIdx: 4, periodYear: 2025, periodMonth: 1, costCategory: 'cleaning', amount: 28000, description: 'Cleaning contractor monthly fee' },
    { propIdx: 5, periodYear: 2025, periodMonth: 1, costCategory: 'utilities', amount: 95000, description: 'Full building electricity including sky garden' },
    { propIdx: 5, periodYear: 2025, periodMonth: 1, costCategory: 'repairs', amount: 55000, description: 'Centralized HVAC for 10 floors' },
    { propIdx: 5, periodYear: 2025, periodMonth: 1, costCategory: 'security', amount: 52000, description: 'Premium security service with facial recognition' },
  ];

  for (const cam of camData) {
    await prisma.camCostEntry.create({
      data: {
        companyId: COMPANY_ID, propertyId: properties[cam.propIdx].id,
        periodYear: cam.periodYear, periodMonth: cam.periodMonth,
        costCategory: cam.costCategory, amount: dec(String(cam.amount)),
        description: cam.description, createdById: admin.id,
      },
    });
  }
  console.log(`  ✅ ${camData.length} CAM cost entries`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 4.4 — Inventory Items & Stock         ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 4.4 — Inventory Items, Stores, Stock');

  const storeData = [
    { name: 'Main Store — Marina Bay', propIdx: 0, location: 'B1 Storage Room' },
    { name: 'Central Tower Store', propIdx: 1, location: 'Ground floor, Service Area' },
    { name: 'GCM Maintenance Store', propIdx: 3, location: 'B2 — Service corridor' },
    { name: 'MTP Store', propIdx: 5, location: 'B3 — Utilities room' },
  ];

  const stores: any[] = [];
  for (const s of storeData) {
    const store = await prisma.store.create({
      data: { companyId: COMPANY_ID, propertyId: properties[s.propIdx].id, name: s.name, location: s.location },
    });
    stores.push(store);
  }
  console.log(`  ✅ ${stores.length} stores`);

  const itemData = [
    { itemCode: 'PLB-PIPE-25', name: '25mm Copper Pipe', category: 'plumbing', unitOfMeasure: 'meters', unitCost: 12.50, reorderPoint: 20, reorderQty: 50, maxStock: 200 },
    { itemCode: 'PLB-VALVE-50', name: '50mm Gate Valve', category: 'plumbing', unitOfMeasure: 'pcs', unitCost: 45.00, reorderPoint: 5, reorderQty: 10, maxStock: 50 },
    { itemCode: 'PLB-SEAL-01', name: 'Pipe Thread Sealant Tape', category: 'plumbing', unitOfMeasure: 'roll', unitCost: 3.50, reorderPoint: 20, reorderQty: 50, maxStock: 200 },
    { itemCode: 'ELC-CB-20A', name: '20A Circuit Breaker', category: 'electrical', unitOfMeasure: 'pcs', unitCost: 28.00, reorderPoint: 10, reorderQty: 20, maxStock: 100 },
    { itemCode: 'ELC-WIRE-25', name: '2.5mm² Electrical Wire', category: 'electrical', unitOfMeasure: 'meters', unitCost: 2.80, reorderPoint: 100, reorderQty: 200, maxStock: 1000 },
    { itemCode: 'ELC-LED-12W', name: '12W LED Downlight', category: 'electrical', unitOfMeasure: 'pcs', unitCost: 15.00, reorderPoint: 30, reorderQty: 50, maxStock: 200 },
    { itemCode: 'ELC-TUBE-36W', name: '36W LED Tube Light', category: 'electrical', unitOfMeasure: 'pcs', unitCost: 18.00, reorderPoint: 20, reorderQty: 40, maxStock: 150 },
    { itemCode: 'HVAC-FILT-20', name: 'HVAC Air Filter 20×20', category: 'hvac', unitOfMeasure: 'pcs', unitCost: 22.00, reorderPoint: 15, reorderQty: 30, maxStock: 100 },
    { itemCode: 'HVAC-REF-R410', name: 'R410A Refrigerant (25kg)', category: 'hvac', unitOfMeasure: 'kg', unitCost: 180.00, reorderPoint: 2, reorderQty: 5, maxStock: 20 },
    { itemCode: 'HVAC-BELT-V', name: 'V-Belt for AHU Motor', category: 'hvac', unitOfMeasure: 'pcs', unitCost: 35.00, reorderPoint: 4, reorderQty: 8, maxStock: 30 },
    { itemCode: 'CLN-FLOOR-5L', name: 'Floor Cleaner (5L)', category: 'cleaning', unitOfMeasure: 'pcs', unitCost: 12.00, reorderPoint: 10, reorderQty: 20, maxStock: 80 },
    { itemCode: 'CLN-GLASS-5L', name: 'Glass Cleaner (5L)', category: 'cleaning', unitOfMeasure: 'pcs', unitCost: 8.50, reorderPoint: 8, reorderQty: 15, maxStock: 60 },
    { itemCode: 'CLN-TRASH-XL', name: 'Trash Bags XL (100pk)', category: 'cleaning', unitOfMeasure: 'box', unitCost: 25.00, reorderPoint: 5, reorderQty: 10, maxStock: 40 },
    { itemCode: 'GEN-PAINT-WH', name: 'Wall Paint — White (20L)', category: 'general', unitOfMeasure: 'pcs', unitCost: 85.00, reorderPoint: 3, reorderQty: 6, maxStock: 20 },
    { itemCode: 'GEN-LOCK-CYL', name: 'Cylinder Lock Set', category: 'general', unitOfMeasure: 'set', unitCost: 42.00, reorderPoint: 5, reorderQty: 10, maxStock: 40 },
    { itemCode: 'GEN-SCREW-MX', name: 'Mixed Screw Assortment Box', category: 'general', unitOfMeasure: 'box', unitCost: 18.00, reorderPoint: 3, reorderQty: 5, maxStock: 20 },
  ];

  const items: any[] = [];
  for (const item of itemData) {
    const created = await prisma.inventoryItem.create({
      data: {
        companyId: COMPANY_ID, itemCode: item.itemCode, name: item.name,
        category: item.category, unitOfMeasure: item.unitOfMeasure,
        unitCost: dec(String(item.unitCost)),
        reorderPoint: dec(String(item.reorderPoint)),
        reorderQty: dec(String(item.reorderQty)),
        maxStock: dec(String(item.maxStock)),
      },
    });
    items.push(created);
  }
  console.log(`  ✅ ${items.length} inventory items`);

  // Stock Levels
  const stockLevelData: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const numStores = 1 + Math.floor(Math.random() * 2);
    for (let s = 0; s < numStores && s < stores.length; s++) {
      const storeIdx = (i + s) % stores.length;
      const max = itemData[i].maxStock;
      const onHand = Math.floor(Math.random() * max * 0.8) + Math.floor(max * 0.1);
      const reserved = Math.floor(Math.random() * Math.min(onHand, 5));
      stockLevelData.push({
        companyId: COMPANY_ID, itemId: items[i].id, storeId: stores[storeIdx].id,
        qtyOnHand: onHand, qtyReserved: reserved, qtyAvailable: onHand - reserved,
      });
    }
  }
  await prisma.stockLevel.createMany({ data: stockLevelData });
  console.log(`  ✅ ${stockLevelData.length} stock level records`);

  // Stock Movements
  const movementData: any[] = [];
  for (let i = 0; i < 20; i++) {
    const itemIdx = Math.floor(Math.random() * items.length);
    const storeIdx = Math.floor(Math.random() * stores.length);
    const types = ['receipt', 'issue', 'receipt', 'receipt'] as const;
    const type = types[Math.floor(Math.random() * types.length)];
    const qty = Math.floor(Math.random() * 20) + 1;
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 30));

    movementData.push({
      companyId: COMPANY_ID, itemId: items[itemIdx].id, storeId: stores[storeIdx].id,
      movementType: type, quantity: type === 'issue' ? -qty : qty,
      unitCost: itemData[itemIdx].unitCost,
      totalCost: itemData[itemIdx].unitCost * qty,
      performedById: techUsers[Math.floor(Math.random() * 4)].id,
      notes: type === 'receipt' ? 'Regular restock' : 'Issued for maintenance work',
      createdAt,
    });
  }
  await prisma.stockMovement.createMany({ data: movementData });
  console.log(`  ✅ ${movementData.length} stock movements`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 4.5 — Housekeeping                    ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 4.5 — Housekeeping Zones, Schedules');

  const hkZoneData = [
    { name: 'Main Lobby', zoneType: 'lobby', propIdx: 0, floor: 'G', areaSqm: 200 },
    { name: 'Pool Deck', zoneType: 'amenity', propIdx: 0, floor: '25', areaSqm: 300 },
    { name: 'Corridors 1-10F', zoneType: 'corridor', propIdx: 0, floor: '1-10', areaSqm: 800 },
    { name: 'Corporate Lobby', zoneType: 'lobby', propIdx: 1, floor: 'G', areaSqm: 350 },
    { name: 'Restrooms All Floors', zoneType: 'restroom', propIdx: 1, floor: 'All', areaSqm: 600 },
    { name: 'B1 Parking', zoneType: 'car_park', propIdx: 1, floor: 'B1', areaSqm: 2000 },
    { name: 'Grand Atrium', zoneType: 'lobby', propIdx: 3, floor: 'G', areaSqm: 1500 },
    { name: 'Food Court — Floor 7', zoneType: 'amenity', propIdx: 3, floor: '7', areaSqm: 2500 },
    { name: 'Mall Corridors 1-4F', zoneType: 'corridor', propIdx: 3, floor: '1-4', areaSqm: 4000 },
    { name: 'Restrooms — All Levels', zoneType: 'restroom', propIdx: 3, floor: 'All', areaSqm: 800 },
    { name: 'B1-B3 Parking', zoneType: 'car_park', propIdx: 3, floor: 'B1-B3', areaSqm: 9000 },
    { name: 'Sky Garden', zoneType: 'amenity', propIdx: 5, floor: '10', areaSqm: 1200 },
  ];

  const hkZones: any[] = [];
  for (const z of hkZoneData) {
    const zone = await prisma.housekeepingZone.create({
      data: {
        companyId: COMPANY_ID, propertyId: properties[z.propIdx].id,
        name: z.name, zoneType: z.zoneType, floor: z.floor,
        areaSqm: z.areaSqm ? dec(String(z.areaSqm)) : null,
      },
    });
    hkZones.push(zone);
  }
  console.log(`  ✅ ${hkZones.length} housekeeping zones`);

  // Cleaning Schedules (daysOfWeek is Int[])
  const cleaningScheduleData = [
    { name: 'Daily Lobby Polish', zoneIdx: 0, freq: 'daily', time: '06:00', duration: 60, type: 'routine', days: [0,1,2,3,4,5,6] },
    { name: 'Pool Deck Cleaning', zoneIdx: 1, freq: 'daily', time: '07:00', duration: 45, type: 'routine', days: [0,1,2,3,4,5,6] },
    { name: 'Weekly Deep Clean — Corridors', zoneIdx: 2, freq: 'weekly', time: '22:00', duration: 180, type: 'deep_clean', days: [0] },
    { name: 'Corporate Lobby — Daily', zoneIdx: 3, freq: 'daily', time: '05:30', duration: 90, type: 'routine', days: [1,2,3,4,5] },
    { name: 'Restroom Sanitization — 3x Daily', zoneIdx: 4, freq: 'daily', time: '08:00', duration: 30, type: 'sanitization', days: [0,1,2,3,4,5,6] },
    { name: 'Atrium Clean — Daily', zoneIdx: 6, freq: 'daily', time: '05:00', duration: 120, type: 'routine', days: [0,1,2,3,4,5,6] },
    { name: 'Food Court — After Hours', zoneIdx: 7, freq: 'daily', time: '22:00', duration: 150, type: 'deep_clean', days: [0,1,2,3,4,5,6] },
    { name: 'Monthly Parking Deep Clean', zoneIdx: 10, freq: 'monthly', time: '23:00', duration: 360, type: 'deep_clean', days: [6] },
  ];

  for (const s of cleaningScheduleData) {
    const zone = hkZones[s.zoneIdx];
    await prisma.cleaningSchedule.create({
      data: {
        companyId: COMPANY_ID, propertyId: zone.propertyId, zoneId: zone.id,
        name: s.name, frequencyType: s.freq, scheduledTime: s.time,
        durationMinutes: s.duration, cleaningType: s.type,
        daysOfWeek: s.days,
        status: 'active',
      },
    });
  }
  console.log(`  ✅ ${cleaningScheduleData.length} cleaning schedules`);

  // ╔══════════════════════════════════════════════╗
  // ║  PHASE 4.6 — Security Incidents              ║
  // ╚══════════════════════════════════════════════╝
  console.log('📦 Phase 4.6 — Security Incidents, Checkpoints');

  const incidentData = [
    { title: 'Shoplifting attempt — Level 2', type: 'theft', severity: 'medium', status: 'resolved', propIdx: 3, daysAgo: 12, resolution: 'Suspect detained. Merchandise recovered. NYPD notified.' },
    { title: 'Graffiti in stairwell B', type: 'vandalism', severity: 'low', status: 'resolved', propIdx: 3, daysAgo: 20, resolution: 'Graffiti removed. Additional CCTV installed.' },
    { title: 'Suspicious package — Lobby', type: 'suspicious_activity', severity: 'critical', status: 'closed', propIdx: 1, daysAgo: 30, resolution: 'Area evacuated. Package harmless. False alarm.' },
    { title: 'Fire alarm — Kitchen area', type: 'fire', severity: 'high', status: 'resolved', propIdx: 2, daysAgo: 8, resolution: 'Cooking smoke triggered alarm. Ventilation improved.' },
    { title: 'Slip and fall — Wet floor', type: 'accident', severity: 'medium', status: 'investigating', propIdx: 4, daysAgo: 3 },
    { title: 'Unauthorized entry — Service area', type: 'trespassing', severity: 'high', status: 'open', propIdx: 5, daysAgo: 1 },
    { title: 'Medical emergency — Food court', type: 'medical', severity: 'critical', status: 'resolved', propIdx: 3, daysAgo: 5, resolution: 'Paramedics called. Customer recovered.' },
    { title: 'Car break-in — B2 parking', type: 'theft', severity: 'high', status: 'investigating', propIdx: 3, daysAgo: 2 },
  ];

  let incCount = 0;
  for (const inc of incidentData) {
    const incidentAt = new Date();
    incidentAt.setDate(incidentAt.getDate() - inc.daysAgo);
    await prisma.securityIncident.create({
      data: {
        companyId: COMPANY_ID, propertyId: properties[inc.propIdx].id,
        incidentNumber: `INC-2025-${String(incCount + 1).padStart(5, '0')}`,
        incidentType: inc.type, severity: inc.severity,
        title: inc.title, description: `Security incident: ${inc.title}`,
        status: inc.status, incidentAt,
        reportedById: admin.id,
        assignedToId: techUsers[incCount % 4].id,
        resolution: (inc as any).resolution || null,
        resolvedAt: inc.status === 'resolved' || inc.status === 'closed' ? new Date() : null,
      },
    });
    incCount++;
  }
  console.log(`  ✅ ${incCount} security incidents`);

  // Patrol Checkpoints
  const checkpointData = [
    { name: 'Main Entrance', propIdx: 0, location: 'Ground Floor Lobby', floor: 'G', sortOrder: 1 },
    { name: 'Pool Area', propIdx: 0, location: 'Rooftop Pool Deck', floor: '25', sortOrder: 2 },
    { name: 'Parking B1', propIdx: 0, location: 'B1 Parking Level', floor: 'B1', sortOrder: 3 },
    { name: 'Lobby Reception', propIdx: 1, location: 'Main Reception Area', floor: 'G', sortOrder: 1 },
    { name: 'Server Room', propIdx: 1, location: '5th Floor Server Room', floor: '5', sortOrder: 2 },
    { name: 'Main Gate', propIdx: 3, location: 'Grand Central Mall Main Entry', floor: 'G', sortOrder: 1 },
    { name: 'Food Court CP', propIdx: 3, location: '7th Floor Food Court', floor: '7', sortOrder: 2 },
    { name: 'Loading Dock', propIdx: 3, location: 'B2 Delivery Bay', floor: 'B2', sortOrder: 3 },
    { name: 'Parking Exit', propIdx: 3, location: 'B3 Parking Exit Gate', floor: 'B3', sortOrder: 4 },
    { name: 'North Wing', propIdx: 5, location: 'Midtown Plaza North Wing', floor: '1', sortOrder: 1 },
    { name: 'Sky Garden CP', propIdx: 5, location: '10th Floor Observation Area', floor: '10', sortOrder: 2 },
  ];

  for (const cp of checkpointData) {
    const { propIdx, ...cpFields } = cp;
    await prisma.patrolCheckpoint.create({
      data: {
        ...cpFields, companyId: COMPANY_ID, propertyId: properties[propIdx].id,
        qrCode: `CHKPT-${properties[propIdx].code}-${cpFields.sortOrder}`,
      },
    });
  }
  console.log(`  ✅ ${checkpointData.length} patrol checkpoints`);

  // ╔══════════════════════════════════════════════╗
  // ║  DONE                                        ║
  // ╚══════════════════════════════════════════════╝
  console.log('\n═══════════════════════════════════════');
  console.log('  🎉 Phase 4 seed complete!');
  console.log(`    ${tickets.length} tickets, ${woCount} work orders`);
  console.log(`    ${techUsers.length} technicians, ${slaConfigs.length} SLAs`);
  console.log(`    ${pmSchedules.length} PM schedules, ${pmWoCount} PM work orders`);
  console.log(`    ${assetCount} facility assets, ${camData.length} CAM costs`);
  console.log(`    ${items.length} items, ${stores.length} stores, ${stockLevelData.length} stock levels`);
  console.log(`    ${hkZones.length} HK zones, ${cleaningScheduleData.length} schedules`);
  console.log(`    ${incCount} security incidents, ${checkpointData.length} checkpoints`);
  console.log('═══════════════════════════════════════');
}

main()
  .catch((e) => { console.error('❌ Phase 4 seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
