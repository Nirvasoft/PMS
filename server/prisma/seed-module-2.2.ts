import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PROPS = {
  marina:    '88da301d-5978-4f57-8791-60e46e429a6e',
  orchard:   '1092cf3b-11e3-41e6-b763-7583d82c125a',
  sukhumvit: '923497a5-8bb6-4ea2-8af3-f92d103116de',
  inya:      '98aa2eea-d3da-4d84-acd6-19184df824f9',
  woodlands: '631b1cb0-e3a0-44fc-9734-c6b4b7e2bb11',
};
const COMPANY = '00000000-0000-0000-0000-000000000001';

type UnitSeed = {
  unitNumber: string; unitType: string; floorNumber: number; floorLabel: string;
  areaSqft?: number; areaSqm?: number; bedroomCount?: number; bathroomCount?: number;
  status: string; furnishing?: string; direction?: string;
};

function genResidentialUnits(towerPrefix: string, floors: number, perFloor: number, types: string[]): UnitSeed[] {
  const units: UnitSeed[] = [];
  const statuses = ['available','available','available','occupied','occupied','occupied','occupied','reserved','maintenance'];
  const furnishings = ['unfurnished','semi_furnished','fully_furnished'];
  const directions = ['north','south','east','west','northeast','northwest'];
  const areas: Record<string,{sqft:number,bed:number,bath:number}> = {
    studio:{sqft:450,bed:0,bath:1}, '1br':{sqft:650,bed:1,bath:1}, '2br':{sqft:900,bed:2,bath:2},
    '3br':{sqft:1200,bed:3,bath:2}, penthouse:{sqft:2500,bed:4,bath:3}, duplex:{sqft:1800,bed:3,bath:3},
  };
  let idx = 0;
  for (let f = 1; f <= floors; f++) {
    for (let u = 1; u <= perFloor; u++) {
      const type = types[(f + u) % types.length];
      const a = areas[type] || { sqft: 800, bed: 2, bath: 1 };
      const variation = 0.85 + Math.random() * 0.3;
      units.push({
        unitNumber: `${towerPrefix}-${String(f).padStart(2,'0')}${String(u).padStart(2,'0')}`,
        unitType: type,
        floorNumber: f, floorLabel: `${f}F`,
        areaSqft: Math.round(a.sqft * variation),
        areaSqm: Math.round(a.sqft * variation * 0.0929),
        bedroomCount: a.bed, bathroomCount: a.bath,
        status: statuses[idx % statuses.length],
        furnishing: furnishings[idx % furnishings.length],
        direction: directions[idx % directions.length],
      });
      idx++;
    }
  }
  return units;
}

function genCommercialUnits(prefix: string, floors: number, perFloor: number): UnitSeed[] {
  const units: UnitSeed[] = [];
  const types = ['office_s','office_m','office_l','retail','f_and_b'];
  const statuses = ['available','occupied','occupied','occupied','reserved','available','occupied'];
  let idx = 0;
  for (let f = 1; f <= floors; f++) {
    const floorTypes = f <= 2 ? ['retail','f_and_b','retail'] : ['office_s','office_m','office_l'];
    for (let u = 1; u <= perFloor; u++) {
      const type = floorTypes[u % floorTypes.length];
      const sqft = type.includes('office_l') ? 3200 : type.includes('office_m') ? 1800 : type.includes('office_s') ? 800 : 1200;
      const v = 0.85 + Math.random() * 0.3;
      units.push({
        unitNumber: `${prefix}-${String(f).padStart(2,'0')}-${String(u).padStart(2,'0')}`,
        unitType: type, floorNumber: f, floorLabel: `Level ${f}`,
        areaSqft: Math.round(sqft * v), areaSqm: Math.round(sqft * v * 0.0929),
        bedroomCount: 0, bathroomCount: type.includes('office_l') ? 2 : 1,
        status: statuses[idx % statuses.length],
        furnishing: 'unfurnished',
      });
      idx++;
    }
  }
  return units;
}

function genMallUnits(prefix: string): UnitSeed[] {
  const units: UnitSeed[] = [];
  const layouts = [
    { floor: 1, label: 'Ground', count: 12, types: ['retail','retail','f_and_b'] },
    { floor: 2, label: 'Level 2', count: 10, types: ['retail','retail','showroom'] },
    { floor: 3, label: 'Level 3', count: 8, types: ['retail','retail','f_and_b'] },
    { floor: 4, label: 'Food Court', count: 15, types: ['f_and_b','f_and_b','f_and_b'] },
  ];
  const statuses = ['occupied','occupied','occupied','occupied','available','reserved','occupied','maintenance'];
  let idx = 0;
  for (const l of layouts) {
    for (let u = 1; u <= l.count; u++) {
      const type = l.types[u % l.types.length];
      const sqft = l.floor === 4 ? 400 : (800 + Math.round(Math.random() * 600));
      units.push({
        unitNumber: `${prefix}-${l.floor}${String(u).padStart(2,'0')}`,
        unitType: type, floorNumber: l.floor, floorLabel: l.label,
        areaSqft: sqft, areaSqm: Math.round(sqft * 0.0929),
        bedroomCount: 0, bathroomCount: 1,
        status: statuses[idx % statuses.length], furnishing: 'unfurnished',
      });
      idx++;
    }
  }
  return units;
}

function genVillaUnits(): UnitSeed[] {
  const statuses = ['available','occupied','occupied','reserved','available','occupied','maintenance','occupied'];
  return Array.from({ length: 24 }, (_, i) => {
    const num = i + 1;
    const type = num <= 4 ? '3br' : num <= 18 ? '4br' : 'duplex';
    const areas: Record<string,{sqft:number,bed:number,bath:number}> = {
      '3br':{sqft:2200,bed:3,bath:3},'4br':{sqft:3000,bed:4,bath:4},duplex:{sqft:4500,bed:5,bath:5},
    };
    const a = areas[type];
    const v = 0.9 + Math.random() * 0.2;
    return {
      unitNumber: `V-${String(num).padStart(2,'0')}`,
      unitType: type, floorNumber: 1, floorLabel: 'Ground',
      areaSqft: Math.round(a.sqft * v), areaSqm: Math.round(a.sqft * v * 0.0929),
      bedroomCount: a.bed, bathroomCount: a.bath,
      status: statuses[i % statuses.length],
      furnishing: i % 3 === 0 ? 'fully_furnished' : 'semi_furnished',
      direction: ['north','south','east','west','lakeside','lakeside'][i % 6],
    };
  });
}

async function main() {
  console.log('🏠 Seeding Module 2.2 — Units...\n');

  const existing = await prisma.unit.count();
  if (existing > 0) {
    console.log(`  ⏭️  ${existing} units already exist, skipping`);
    return;
  }

  const utypes = await prisma.unitType.findMany();
  const utId = (code: string) => utypes.find(t => t.code === code)?.id;

  // Create towers first
  const towerDefs = [
    { propertyId: PROPS.marina, name: 'Tower A', code: 'TWR-A', totalFloors: 35, yearBuilt: 2019 },
    { propertyId: PROPS.marina, name: 'Tower B', code: 'TWR-B', totalFloors: 32, yearBuilt: 2020 },
    { propertyId: PROPS.orchard, name: 'North Wing', code: 'NW', totalFloors: 25 },
    { propertyId: PROPS.orchard, name: 'South Wing', code: 'SW', totalFloors: 25 },
    { propertyId: PROPS.sukhumvit, name: 'Main Tower', code: 'MT', totalFloors: 20 },
  ];

  const towerMap: Record<string, string> = {};
  for (const t of towerDefs) {
    const tower = await prisma.tower.create({ data: { ...t, companyId: COMPANY } });
    towerMap[`${t.propertyId}:${t.code}`] = tower.id;
    console.log(`  🏗️  Tower: ${t.name}`);
  }

  // Generate units per property
  const propUnits: { propertyId: string; towerId?: string; units: UnitSeed[] }[] = [
    { propertyId: PROPS.marina, towerId: towerMap[`${PROPS.marina}:TWR-A`],
      units: genResidentialUnits('A', 20, 6, ['studio','1br','2br','2br','3br','penthouse']) },
    { propertyId: PROPS.marina, towerId: towerMap[`${PROPS.marina}:TWR-B`],
      units: genResidentialUnits('B', 18, 5, ['1br','2br','2br','3br','3br']) },
    { propertyId: PROPS.orchard, towerId: towerMap[`${PROPS.orchard}:NW`],
      units: genCommercialUnits('NW', 12, 4) },
    { propertyId: PROPS.orchard, towerId: towerMap[`${PROPS.orchard}:SW`],
      units: genCommercialUnits('SW', 10, 3) },
    { propertyId: PROPS.sukhumvit, towerId: towerMap[`${PROPS.sukhumvit}:MT`],
      units: genResidentialUnits('S', 15, 4, ['studio','1br','2br','3br']) },
    { propertyId: PROPS.inya, units: genVillaUnits() },
    { propertyId: PROPS.woodlands, units: genMallUnits('WM') },
  ];

  let total = 0;
  for (const pu of propUnits) {
    const batch = pu.units.map(u => ({
      propertyId: pu.propertyId,
      companyId: COMPANY,
      towerId: pu.towerId || null,
      unitNumber: u.unitNumber,
      unitTypeId: utId(u.unitType) || null,
      unitType: u.unitType,
      floorNumber: u.floorNumber,
      floorLabel: u.floorLabel,
      areaSqft: u.areaSqft ? Number(u.areaSqft) : null,
      areaSqm: u.areaSqm ? Number(u.areaSqm) : null,
      bedroomCount: u.bedroomCount ?? 0,
      bathroomCount: u.bathroomCount ?? 0,
      status: u.status,
      furnishing: u.furnishing || 'unfurnished',
      direction: u.direction || null,
      ownershipType: 'company',
    }));
    await prisma.unit.createMany({ data: batch as any });
    total += batch.length;
    console.log(`  ✅ ${pu.propertyId.slice(0,8)}… → ${batch.length} units`);
  }

  // Update totalUnits on each property
  for (const key of Object.keys(PROPS)) {
    const pid = PROPS[key as keyof typeof PROPS];
    const count = await prisma.unit.count({ where: { propertyId: pid } });
    await prisma.property.update({ where: { id: pid }, data: { totalUnits: count } });
  }

  console.log(`\n✅ ${total} units seeded across ${propUnits.length} groups!`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
