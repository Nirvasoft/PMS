import { prisma } from '../../../common/database';
import logger from '../../../common/logger';
import cron from 'node-cron';

/**
 * Daily cron (6:00 AM): Generate PM work orders for upcoming schedules
 * and mark overdue PM work orders.
 */
export function startPmGeneratorJob() {
  // Generate WOs for due PM schedules (daily at 6 AM)
  cron.schedule('0 6 * * *', async () => {
    logger.info('[PM Cron] Running PM work order generation...');
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Find all active schedules where (nextDueDate - advanceDays) <= today
      // and no WO already exists for that due date
      const dueSchedules = await prisma.$queryRawUnsafe<Array<{ id: string; company_id: string }>>(
        `SELECT s.id, s.company_id FROM pm_schedules s
         WHERE s.status = 'active'
           AND (s.next_due_date - s.advance_days * interval '1 day')::date <= $1::date
           AND NOT EXISTS (
             SELECT 1 FROM pm_work_orders pw
             WHERE pw.schedule_id = s.id
               AND pw.due_date = s.next_due_date
               AND pw.status NOT IN ('skipped')
           )`,
        todayStr,
      );

      let created = 0;
      for (const sched of dueSchedules) {
        try {
          // Create ticket + PM work order
          const schedule = await prisma.pmSchedule.findUnique({
            where: { id: sched.id },
          });
          if (!schedule) continue;

          await prisma.pmWorkOrder.create({
            data: {
              companyId: sched.company_id,
              scheduleId: sched.id,
              dueDate: schedule.nextDueDate,
              status: 'scheduled',
            },
          });
          created++;
        } catch (err) {
          logger.warn(`[PM Cron] Failed to create WO for schedule ${sched.id}: ${err}`);
        }
      }

      if (created > 0) {
        logger.info(`[PM Cron] Created ${created} PM work orders`);
      }
    } catch (err) {
      logger.error(`[PM Cron] Generation error: ${err}`);
    }
  });

  // Mark overdue PM work orders (daily at midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const result = await prisma.pmWorkOrder.updateMany({
        where: {
          status: 'scheduled',
          dueDate: { lt: new Date(todayStr) },
        },
        data: { status: 'overdue' },
      });
      if (result.count > 0) {
        logger.info(`[PM Cron] Marked ${result.count} PM work orders as overdue`);
      }
    } catch (err) {
      logger.error(`[PM Cron] Overdue check error: ${err}`);
    }
  });

  logger.info('🔧 PM generator cron jobs started (6:00 AM generation, midnight overdue check)');
}
