import cron from 'node-cron';
import { slaService } from '../sla.service';
import { logger } from '../../../common/logger';

/**
 * SLA Monitor Cron Job
 *
 * Runs every 15 minutes to detect SLA breaches on maintenance tickets.
 *
 * FUTURE-READY: This cron wrapper can be replaced with a Bull/BullMQ
 * queue processor without changing the core breach-detection logic in
 * slaService.checkBreaches(). To migrate:
 *
 * 1. Create a Bull queue: `new Queue('sla-monitor')`
 * 2. Add a repeatable job: `queue.add('check', {}, { repeat: { every: 900000 } })`
 * 3. Create a worker: `new Worker('sla-monitor', async () => slaService.checkBreaches())`
 * 4. Remove this cron file.
 */
export function startSlaMonitorJob() {
  // Every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await slaService.checkBreaches();
    } catch (err: any) {
      logger.error(`SLA monitor job failed: ${err.message}`);
    }
  });

  logger.info('SLA monitor cron job started (every 15 minutes)');
}
