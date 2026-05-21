import cron from 'node-cron';
import { logger } from '../../../common/logger';
import { billingSchedulesService } from '../billingSchedules.service';
import { invoicesService } from '../invoices.service';

/**
 * Runs daily at 2:00 AM.
 * Generates invoices for all billing schedules due today or earlier.
 */
export function startDailyBillingJob() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const today = new Date();
      const dueSchedules = await billingSchedulesService.findDueSchedules(today);

      let generated = 0;
      for (const schedule of dueSchedules) {
        try {
          await invoicesService.generateFromSchedule(schedule.id);
          generated++;
        } catch (err: any) {
          logger.error(`Billing job error for schedule ${schedule.id}: ${err.message}`);
        }
      }

      if (generated > 0) {
        logger.info(`Daily billing job: generated ${generated} invoices from ${dueSchedules.length} due schedules`);
      }
    } catch (err) {
      logger.error('Daily billing job error:', err);
    }
  });

  logger.info('Daily billing cron started (daily at 2:00 AM)');
}
