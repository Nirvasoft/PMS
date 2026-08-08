import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';

/**
 * Meter Offline Check — Runs every 4 hours at :30.
 *
 * For each company with smart meter devices:
 *  1. Find devices that haven't been polled within 3× their polling interval
 *  2. Mark them as 'offline'
 *  3. Create a maintenance ticket (source: 'system') for each newly-offline meter
 *  4. Skip if there's already an open ticket for the same meter
 */
export function startMeterOfflineCheckJob() {
  cron.schedule('30 */4 * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalTicketsCreated = 0;

      for (const company of companies) {
        try {
          await setTenantContext(company.id);
          const result = await checkAndCreateTickets(company.id);
          totalTicketsCreated += result;
        } catch (err: any) {
          logger.error(`Meter offline check error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalTicketsCreated > 0) {
        logger.info(`Meter offline check: ${totalTicketsCreated} tickets created`);
      }
    } catch (err) {
      logger.error('Meter offline check cron error:', err);
    }
  });

  logger.info('Meter offline check cron started (every 4 hours at :30)');
}

export async function checkAndCreateTickets(companyId: string): Promise<number> {
  const now = new Date();
  let ticketsCreated = 0;

  const devices = await prisma.smartMeterDevice.findMany({
    where: { companyId },
    include: {
      meter: {
        select: {
          id: true, meterSerialNo: true, meterType: true,
          unitId: true, propertyId: true,
          unit: { select: { unitNumber: true } },
        },
      },
    },
  });

  for (const device of devices) {
    // Determine if offline: no poll within 3× the polling interval
    const thresholdMinutes = device.pollingIntervalMinutes * 3;
    const cutoff = new Date(now.getTime() - thresholdMinutes * 60000);

    const isOffline = !device.lastPolledAt || new Date(device.lastPolledAt) < cutoff;

    if (!isOffline) continue;

    // Skip if already marked offline (avoid re-processing)
    if (device.connectionStatus === 'offline') {
      // Check if there's already an open ticket for this meter
      const existingTicket = await prisma.maintenanceTicket.findFirst({
        where: {
          companyId,
          source: 'system',
          status: { notIn: ['closed', 'cancelled', 'completed'] },
          title: { contains: device.meter.meterSerialNo },
        },
      });
      if (existingTicket) continue; // Already has open ticket
    }

    // Mark device as offline
    await prisma.smartMeterDevice.update({
      where: { id: device.id },
      data: {
        connectionStatus: 'offline',
        errorMessage: `No response since ${device.lastPolledAt?.toISOString() || 'never'}`,
      },
    });

    // Find or create a "System / IoT" maintenance category
    let category = await prisma.maintenanceCategory.findFirst({
      where: { companyId, name: { in: ['System', 'IoT', 'Smart Meter', 'Equipment'] } },
    });
    if (!category) {
      category = await prisma.maintenanceCategory.create({
        data: { companyId, name: 'IoT / Smart Meter', icon: 'zap' },
      });
    }

    // Generate ticket number
    const count = await prisma.maintenanceTicket.count({ where: { companyId } });
    const ticketNumber = `MO-${String(count + 1).padStart(5, '0')}`;

    const unitNumber = device.meter.unit?.unitNumber || 'Unknown';
    const lastSeen = device.lastPolledAt
      ? new Date(device.lastPolledAt).toLocaleString()
      : 'Never';

    await prisma.maintenanceTicket.create({
      data: {
        companyId,
        propertyId: device.meter.propertyId,
        unitId: device.meter.unitId,
        ticketNumber,
        title: `[Auto] Smart Meter Offline: ${device.meter.meterSerialNo}`,
        description: [
          `Smart meter ${device.meter.meterSerialNo} (${device.meter.meterType}) in Unit ${unitNumber} has gone offline.`,
          ``,
          `Protocol: ${device.protocol}`,
          `Last polled: ${lastSeen}`,
          `Expected interval: every ${device.pollingIntervalMinutes} minutes`,
          `Offline threshold: ${thresholdMinutes} minutes (3× interval)`,
          ``,
          `Please check the meter connection, power supply, and network connectivity.`,
        ].join('\n'),
        categoryId: category.id,
        priority: 'P2',
        status: 'open',
        source: 'system',
        isUrgent: false,
        requiresAccess: true,
        locationDetail: `Unit ${unitNumber} — ${device.meter.meterType} meter`,
      },
    });

    ticketsCreated++;
    logger.info(`Created offline meter ticket ${ticketNumber} for ${device.meter.meterSerialNo}`);
  }

  return ticketsCreated;
}
