import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { penaltyService } from '../penalty.service';

/**
 * Runs daily at 3:00 AM.
 * Checks overdue invoices and applies late payment penalties.
 */
export function startPenaltyCheckJob() {
  cron.schedule('0 3 * * *', async () => {
    try {
      await penaltyService.checkAndApplyPenalties();
    } catch (err) {
      logger.error('Penalty check job error:', err);
    }
  });

  logger.info('Penalty check cron started (daily at 3:00 AM)');
}
