import cron from 'node-cron';
import { slaService } from '../sla.service';
import { logger } from '../../../common/logger';

/**
 * SLA Monitor Cron Job
 *
 * Runs every 15 minutes to:
 * 1. Send pre-breach warnings (2h before SLA deadline)
 * 2. Detect and record SLA breaches on maintenance tickets
 *
 * FUTURE-READY: This cron wrapper can be replaced with a Bull/BullMQ
 * queue processor without changing the core logic in slaService.
 */
export function startSlaMonitorJob() {
  // Every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      // Warnings first — fire before breach is recorded in same cycle
      await slaService.checkWarnings();
      await slaService.checkBreaches();
    } catch (err: any) {
      logger.error(`SLA monitor job failed: ${err.message}`);
    }
  });

  logger.info('SLA monitor cron job started (every 15 minutes)');
}
