import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { prisma, setTenantContext } from '../../../common/database';

/**
 * Smart Meter Polling — Runs every hour at :00.
 *
 * For each company with active smart meter devices:
 *  1. Find devices with supported protocols (modbus_tcp, mqtt, http)
 *  2. Poll each device for current reading
 *  3. Calculate consumption delta from previous reading
 *  4. Store SmartMeterReading and update device status
 *
 * Currently a stub — replace protocol handlers with real implementations.
 */
export function startSmartMeterPollingJob() {
  cron.schedule('0 * * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let totalPolled = 0;

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          const devices = await prisma.smartMeterDevice.findMany({
            where: {
              companyId: company.id,
              connectionStatus: { not: 'offline' },
            },
            include: {
              meter: { select: { id: true, meterType: true, unitId: true, propertyId: true } },
            },
          });

          for (const device of devices) {
            try {
              // ── STUB: Replace with actual protocol-specific polling ──
              // switch (device.protocol) {
              //   case 'modbus_tcp':
              //     reading = await pollModbusTcp(device.host, device.port, device.modbusUnitId);
              //     break;
              //   case 'mqtt':
              //     reading = await getMqttReading(device.mqttBroker, device.mqttTopic);
              //     break;
              //   case 'http':
              //     reading = await fetchHttpReading(device.httpEndpoint);
              //     break;
              // }

              // For stub: skip actual polling, just update last polled timestamp
              if (!device.host && !device.mqttBroker && !device.httpEndpoint) {
                continue; // No endpoint configured, skip
              }

              await prisma.smartMeterDevice.update({
                where: { id: device.id },
                data: {
                  lastPolledAt: new Date(),
                  connectionStatus: 'online',
                  errorMessage: null,
                },
              });

              totalPolled++;
            } catch (err: any) {
              await prisma.smartMeterDevice.update({
                where: { id: device.id },
                data: {
                  connectionStatus: 'error',
                  errorMessage: err.message,
                },
              });
              logger.error(`Smart meter poll error for device ${device.id}: ${err.message}`);
            }
          }
        } catch (err: any) {
          logger.error(`Smart meter polling error for company ${company.code}: ${err.message}`);
        }
      }

      if (totalPolled > 0) {
        logger.debug(`Smart meter polling: ${totalPolled} devices polled (stub mode)`);
      }
    } catch (err) {
      logger.error('Smart meter polling cron error:', err);
    }
  });

  logger.info('Smart meter polling cron started (hourly at :00)');
}
