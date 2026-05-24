import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';

/**
 * Footfall Sync Stub — Runs every hour at :05.
 *
 * In production: polls each sensor's API endpoint to fetch hourly counts.
 * Currently: logs sync status for configured sensors.
 * Replace the stub with actual vendor API calls (SensMax, Hikvision, Axis, etc.).
 */
export function startFootfallSyncJob() {
  cron.schedule('5 * * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalSynced = 0;

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          const sensors = await prisma.footfallSensor.findMany({
            where: { companyId: company.id, isActive: true },
            select: { id: true, name: true, sensorId: true, apiEndpoint: true, vendor: true, propertyId: true, zone: true },
          });

          for (const sensor of sensors) {
            if (!sensor.apiEndpoint) continue;

            // ── STUB: Replace with real vendor API call ──
            // Example for SensMax:
            //   const response = await fetch(sensor.apiEndpoint, { headers: { 'X-API-Key': decrypt(sensor.apiKeyEnc) } });
            //   const { entries, exits } = await response.json();
            //
            // For now, log that we would sync
            logger.debug(`Footfall sync stub: sensor ${sensor.name} (${sensor.vendor || 'unknown'}) at ${sensor.apiEndpoint}`);

            // Placeholder — in production, upsert FootfallCount here:
            // await prisma.footfallCount.upsert({
            //   where: { uq_footfall_sensor_period: { sensorId: sensor.id, countedAt: hourDate, periodType: 'hourly' } },
            //   update: { entries, exits },
            //   create: { companyId, sensorId: sensor.id, propertyId: sensor.propertyId, countedAt: hourDate, periodType: 'hourly', entries, exits, zone: sensor.zone },
            // });

            totalSynced++;
          }
        } catch (err: any) {
          logger.error(`Footfall sync error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalSynced > 0) {
        logger.debug(`Footfall sync: processed ${totalSynced} sensors (stub mode)`);
      }
    } catch (err) {
      logger.error('Footfall sync cron error:', err);
    }
  });

  logger.info('Footfall sync cron started (hourly at :05)');
}
