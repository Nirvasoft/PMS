import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  console.log('\n👣 Seeding Footfall Data');

  // Find sensors
  const sensors = await prisma.footfallSensor.findMany({ where: { companyId: COMPANY_ID } });
  if (!sensors.length) {
    console.log('  ⚠️  No footfall sensors found. Creating demo sensors...');
    const property = await prisma.property.findFirst({ where: { companyId: COMPANY_ID } });
    if (!property) { console.log('  ❌ No property found'); return; }

    const sensorData = [
      { sensorId: 'SNSR-MAIN-01', name: 'Main Entrance', zone: 'Main Hall', floor: 'G', location: 'Front gate', sensorType: 'stereo', vendor: 'SensMax' },
      { sensorId: 'SNSR-EAST-01', name: 'East Wing Entry', zone: 'East Wing', floor: 'G', location: 'East corridor', sensorType: 'stereo', vendor: 'SensMax' },
      { sensorId: 'SNSR-WEST-01', name: 'West Wing Entry', zone: 'West Wing', floor: 'G', location: 'West corridor', sensorType: 'infrared', vendor: 'Hikvision' },
      { sensorId: 'SNSR-PRKG-01', name: 'Parking Entry', zone: 'Parking', floor: 'B1', location: 'Basement elevator lobby', sensorType: 'thermal', vendor: 'Axis' },
      { sensorId: 'SNSR-F1-01', name: 'Floor 1 Escalator', zone: 'Floor 1', floor: '1', location: 'Central escalator', sensorType: 'stereo', vendor: 'SensMax' },
      { sensorId: 'SNSR-F2-01', name: 'Floor 2 Escalator', zone: 'Floor 2', floor: '2', location: 'Central escalator', sensorType: 'stereo', vendor: 'SensMax' },
    ];

    for (const s of sensorData) {
      await prisma.footfallSensor.create({
        data: { ...s, companyId: COMPANY_ID, propertyId: property.id },
      });
    }
    console.log(`  ✅ Created ${sensorData.length} demo sensors`);
  }

  const allSensors = await prisma.footfallSensor.findMany({ where: { companyId: COMPANY_ID } });
  const propertyId = allSensors[0].propertyId;

  // Generate 30 days of hourly data
  const now = new Date();
  let totalRecords = 0;

  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);

    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const weekendMultiplier = isWeekend ? 1.6 : 1.0;

    for (const sensor of allSensors) {
      // Generate hourly data (8am to 10pm)
      for (let hour = 8; hour <= 22; hour++) {
        const hourDate = new Date(date);
        hourDate.setUTCHours(hour, 0, 0, 0);

        // Bell curve distribution: peak at 12-14
        const hourFactor = Math.exp(-0.5 * Math.pow((hour - 13) / 3, 2));
        const baseSensor = sensor.zone === 'Main Hall' ? 300 : sensor.zone === 'Parking' ? 200 : 150;
        const base = Math.round(baseSensor * hourFactor * weekendMultiplier);
        const noise = Math.round((Math.random() - 0.5) * base * 0.3);
        const entries = Math.max(5, base + noise);
        const exits = Math.max(3, entries - Math.round((Math.random() - 0.4) * 20));

        await prisma.footfallCount.upsert({
          where: {
            uq_footfall_sensor_period: {
              sensorId: sensor.id,
              countedAt: hourDate,
              periodType: 'hourly',
            },
          },
          update: { entries, exits },
          create: {
            companyId: COMPANY_ID,
            sensorId: sensor.id,
            propertyId,
            countedAt: hourDate,
            periodType: 'hourly',
            entries,
            exits,
            zone: sensor.zone,
          },
        });
        totalRecords++;
      }
    }
  }

  console.log(`  ✅ ${totalRecords} footfall count records (${allSensors.length} sensors × 31 days × 15 hours)`);
  console.log('✅ Footfall seed complete\n');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
