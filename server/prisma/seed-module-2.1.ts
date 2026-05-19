import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Property IDs from existing DB
const PROPS = {
  marina:    '88da301d-5978-4f57-8791-60e46e429a6e',
  orchard:   '1092cf3b-11e3-41e6-b763-7583d82c125a',
  sukhumvit: '923497a5-8bb6-4ea2-8af3-f92d103116de',
  inya:      '98aa2eea-d3da-4d84-acd6-19184df824f9',
  woodlands: '631b1cb0-e3a0-44fc-9734-c6b4b7e2bb11',
};
const COMPANY = '00000000-0000-0000-0000-000000000001';

async function seedFacilities() {
  console.log('🏗️  Seeding facilities...');
  const types = await prisma.facilityType.findMany();
  const ftId = (code: string) => types.find(t => t.code === code)!.id;

  const facilities = [
    // Marina Bay Residences — luxury condo
    { propertyId: PROPS.marina, facilityTypeId: ftId('swimming_pool'), name: 'Infinity Pool', description: '50m infinity pool on Level 8 with panoramic bay views', floor: '8', capacity: 40, isBookable: false },
    { propertyId: PROPS.marina, facilityTypeId: ftId('gym'), name: 'Sky Fitness Center', description: 'State-of-the-art gym with Technogym equipment', floor: '7', capacity: 30, isBookable: false },
    { propertyId: PROPS.marina, facilityTypeId: ftId('bbq_area'), name: 'Poolside BBQ Terrace', floor: '8', capacity: 20, isBookable: true },
    { propertyId: PROPS.marina, facilityTypeId: ftId('concierge'), name: '24/7 Concierge Desk', floor: '1' },
    { propertyId: PROPS.marina, facilityTypeId: ftId('parking'), name: 'Basement Car Park', description: '3-level basement parking with 450 lots', floor: 'B1-B3', capacity: 450 },
    { propertyId: PROPS.marina, facilityTypeId: ftId('elevator'), name: 'High-Speed Lifts', description: '6 passenger lifts + 2 service lifts', floor: 'All' },
    { propertyId: PROPS.marina, facilityTypeId: ftId('cctv'), name: 'CCTV Network', description: '120+ cameras covering all common areas' },
    { propertyId: PROPS.marina, facilityTypeId: ftId('guard_post'), name: 'Guard House', floor: '1' },
    { propertyId: PROPS.marina, facilityTypeId: ftId('rooftop_garden'), name: 'Sky Garden', floor: '35', capacity: 60 },
    { propertyId: PROPS.marina, facilityTypeId: ftId('meeting_room'), name: 'Business Lounge', floor: '2', capacity: 12, isBookable: true },

    // Orchard Central Tower — commercial
    { propertyId: PROPS.orchard, facilityTypeId: ftId('elevator'), name: 'Express Lifts', description: '8 high-speed lifts', floor: 'All' },
    { propertyId: PROPS.orchard, facilityTypeId: ftId('parking'), name: 'Multi-storey Car Park', floor: 'B1-B4', capacity: 600 },
    { propertyId: PROPS.orchard, facilityTypeId: ftId('meeting_room'), name: 'Conference Center', description: '3 meeting rooms with AV equipment', floor: '3', capacity: 50, isBookable: true },
    { propertyId: PROPS.orchard, facilityTypeId: ftId('coworking_space'), name: 'Co-Work Hub', floor: '5', capacity: 40, isBookable: true },
    { propertyId: PROPS.orchard, facilityTypeId: ftId('cctv'), name: 'Security Surveillance' },
    { propertyId: PROPS.orchard, facilityTypeId: ftId('access_control'), name: 'Card Access System' },
    { propertyId: PROPS.orchard, facilityTypeId: ftId('backup_power'), name: 'Backup Generator' },
    { propertyId: PROPS.orchard, facilityTypeId: ftId('restaurant'), name: 'Ground Floor Café', floor: '1', capacity: 80 },

    // Sukhumvit Plaza — mixed use
    { propertyId: PROPS.sukhumvit, facilityTypeId: ftId('swimming_pool'), name: 'Lap Pool', floor: '6', capacity: 25 },
    { propertyId: PROPS.sukhumvit, facilityTypeId: ftId('gym'), name: 'Residents Gym', floor: '6', capacity: 20 },
    { propertyId: PROPS.sukhumvit, facilityTypeId: ftId('parking'), name: 'Underground Parking', floor: 'B1-B2', capacity: 200 },
    { propertyId: PROPS.sukhumvit, facilityTypeId: ftId('elevator'), name: 'Passenger Lifts', floor: 'All' },
    { propertyId: PROPS.sukhumvit, facilityTypeId: ftId('retail_shops'), name: 'Ground Floor Retail', floor: '1-2' },
    { propertyId: PROPS.sukhumvit, facilityTypeId: ftId('guard_post'), name: 'Security Booth', floor: '1' },
    { propertyId: PROPS.sukhumvit, facilityTypeId: ftId('laundry'), name: 'Self-Service Laundry', floor: '3', isBookable: false },

    // Inya Lake Villas — residential
    { propertyId: PROPS.inya, facilityTypeId: ftId('swimming_pool'), name: 'Clubhouse Pool', description: 'Resort-style pool with kids area', capacity: 35 },
    { propertyId: PROPS.inya, facilityTypeId: ftId('gym'), name: 'Villa Gym', capacity: 15 },
    { propertyId: PROPS.inya, facilityTypeId: ftId('playground'), name: 'Children Playground' },
    { propertyId: PROPS.inya, facilityTypeId: ftId('bbq_area'), name: 'Garden BBQ Pavilion', capacity: 30, isBookable: true },
    { propertyId: PROPS.inya, facilityTypeId: ftId('jogging_track'), name: 'Lakeside Jogging Trail', description: '1.2km track around the lake' },
    { propertyId: PROPS.inya, facilityTypeId: ftId('tennis_court'), name: 'Tennis Court', capacity: 4, isBookable: true },
    { propertyId: PROPS.inya, facilityTypeId: ftId('guard_post'), name: 'Main Gate Security' },
    { propertyId: PROPS.inya, facilityTypeId: ftId('cctv'), name: 'Perimeter CCTV' },

    // Woodlands Mall — retail
    { propertyId: PROPS.woodlands, facilityTypeId: ftId('parking'), name: 'Rooftop Car Park', floor: 'R1-R3', capacity: 1200 },
    { propertyId: PROPS.woodlands, facilityTypeId: ftId('elevator'), name: 'Escalators & Lifts', floor: 'All' },
    { propertyId: PROPS.woodlands, facilityTypeId: ftId('cctv'), name: 'Mall Surveillance', description: '200+ cameras' },
    { propertyId: PROPS.woodlands, facilityTypeId: ftId('access_control'), name: 'After-Hours Access' },
    { propertyId: PROPS.woodlands, facilityTypeId: ftId('backup_power'), name: 'Dual Backup Generators' },
    { propertyId: PROPS.woodlands, facilityTypeId: ftId('restaurant'), name: 'Food Court', floor: '4', capacity: 500 },
    { propertyId: PROPS.woodlands, facilityTypeId: ftId('locker_room'), name: 'Staff Lockers', floor: 'B1', capacity: 100 },
  ];

  for (const f of facilities) {
    const exists = await prisma.propertyFacility.findFirst({
      where: { propertyId: f.propertyId, facilityTypeId: f.facilityTypeId },
    });
    if (!exists) {
      await prisma.propertyFacility.create({ data: f as any });
    }
  }
  console.log(`  ✅ ${facilities.length} facilities seeded`);
}

async function seedContacts() {
  console.log('📇 Seeding contacts...');
  const contacts = [
    // Marina Bay
    { propertyId: PROPS.marina, role: 'building_manager', name: 'David Tan Wei Ming', phone: '+65 6234 5678', mobile: '+65 9123 4567', email: 'david.tan@marinabay.sg', isPrimary: true, sortOrder: 1 },
    { propertyId: PROPS.marina, role: 'maintenance', name: 'Ahmad bin Ismail', phone: '+65 6234 5679', mobile: '+65 9234 5678', email: 'maintenance@marinabay.sg', sortOrder: 2 },
    { propertyId: PROPS.marina, role: 'security', name: 'Sgt. Ravi Kumar', phone: '+65 6234 5680', mobile: '+65 9345 6789', sortOrder: 3 },
    { propertyId: PROPS.marina, role: 'emergency', name: 'Emergency Hotline', phone: '+65 6234 9999', isPrimary: false, sortOrder: 4 },
    // Orchard
    { propertyId: PROPS.orchard, role: 'building_manager', name: 'Sarah Chen Li Hua', phone: '+65 6789 1234', mobile: '+65 9456 7890', email: 'sarah.chen@orchardtower.sg', isPrimary: true, sortOrder: 1 },
    { propertyId: PROPS.orchard, role: 'maintenance', name: 'Tan Kok Seng', phone: '+65 6789 1235', email: 'facilities@orchardtower.sg', sortOrder: 2 },
    { propertyId: PROPS.orchard, role: 'security', name: 'SecureGuard Pte Ltd', phone: '+65 6789 1236', sortOrder: 3 },
    // Sukhumvit
    { propertyId: PROPS.sukhumvit, role: 'building_manager', name: 'Somchai Rattanakit', phone: '+66 2 345 6789', mobile: '+66 81 234 5678', email: 'somchai@sukhumvitplaza.th', isPrimary: true, sortOrder: 1 },
    { propertyId: PROPS.sukhumvit, role: 'maintenance', name: 'Prasert Wongchai', phone: '+66 2 345 6790', sortOrder: 2 },
    { propertyId: PROPS.sukhumvit, role: 'security', name: 'Guard Force Thailand', phone: '+66 2 345 6791', sortOrder: 3 },
    // Inya Lake
    { propertyId: PROPS.inya, role: 'building_manager', name: 'U Aung Kyaw Moe', phone: '+95 1 234 567', mobile: '+95 9 765 432 100', email: 'aungkyaw@inyavillas.mm', isPrimary: true, sortOrder: 1 },
    { propertyId: PROPS.inya, role: 'maintenance', name: 'Ko Min Thu', phone: '+95 1 234 568', mobile: '+95 9 876 543 210', sortOrder: 2 },
    { propertyId: PROPS.inya, role: 'security', name: 'Golden Shield Security', phone: '+95 1 234 569', sortOrder: 3 },
    { propertyId: PROPS.inya, role: 'emergency', name: 'Emergency Line', phone: '+95 1 234 999', sortOrder: 4 },
    // Woodlands
    { propertyId: PROPS.woodlands, role: 'building_manager', name: 'Jason Lim Kah Wai', phone: '+65 6543 2100', mobile: '+65 9567 8901', email: 'jason.lim@woodlandsmall.sg', isPrimary: true, sortOrder: 1 },
    { propertyId: PROPS.woodlands, role: 'maintenance', name: 'Mega Facilities Pte Ltd', phone: '+65 6543 2101', email: 'ops@megafacilities.sg', sortOrder: 2 },
    { propertyId: PROPS.woodlands, role: 'security', name: 'Certis Cisco', phone: '+65 6543 2102', sortOrder: 3 },
  ];

  const existing = await prisma.propertyContact.count();
  if (existing === 0) {
    await prisma.propertyContact.createMany({ data: contacts });
    console.log(`  ✅ ${contacts.length} contacts created`);
  } else {
    console.log(`  ⏭️  Contacts already exist (${existing}), skipping`);
  }
}

async function seedPhotos() {
  console.log('📸 Seeding photos...');
  const baseUrl = '/seed-photos';
  const photos = [
    { propertyId: PROPS.marina, storageKey: 'seed/residential.png', url: `${baseUrl}/residential.png`, caption: 'Marina Bay Residences — Poolside View', isCover: true, sortOrder: 1 },
    { propertyId: PROPS.orchard, storageKey: 'seed/commercial.png', url: `${baseUrl}/commercial.png`, caption: 'Orchard Central Tower — Exterior', isCover: true, sortOrder: 1 },
    { propertyId: PROPS.woodlands, storageKey: 'seed/mall.png', url: `${baseUrl}/mall.png`, caption: 'Woodlands Mall — Grand Atrium', isCover: true, sortOrder: 1 },
    { propertyId: PROPS.sukhumvit, storageKey: 'seed/commercial.png', url: `${baseUrl}/commercial.png`, caption: 'Sukhumvit Plaza — Building Facade', isCover: true, sortOrder: 1 },
    { propertyId: PROPS.inya, storageKey: 'seed/residential.png', url: `${baseUrl}/residential.png`, caption: 'Inya Lake Villas — Clubhouse', isCover: true, sortOrder: 1 },
  ];

  const existing = await prisma.propertyPhoto.count();
  if (existing === 0) {
    await prisma.propertyPhoto.createMany({ data: photos });
    // Also set coverImageUrl on properties
    for (const p of photos) {
      await prisma.property.update({ where: { id: p.propertyId }, data: { coverImageUrl: p.url } });
    }
    console.log(`  ✅ ${photos.length} photos + cover URLs set`);
  } else {
    console.log(`  ⏭️  Photos already exist, skipping`);
  }
}

async function main() {
  console.log('🌱 Seeding Module 2.1 — Facilities, Contacts, Photos...\n');
  await seedFacilities();
  await seedContacts();
  await seedPhotos();
  console.log('\n✅ Module 2.1 seed complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
