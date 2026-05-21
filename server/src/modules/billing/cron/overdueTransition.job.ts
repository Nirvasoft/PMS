import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { invoicesService } from '../invoices.service';

/**
 * Runs daily at 4:00 AM.
 * Transitions past-due invoices to 'overdue' status.
 */
export function startOverdueTransitionJob() {
  cron.schedule('0 4 * * *', async () => {
    try {
      await invoicesService.transitionOverdue();
    } catch (err) {
      logger.error('Overdue transition job error:', err);
    }
  });

  logger.info('Overdue transition cron started (daily at 4:00 AM)');
}
