import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';
import cron from 'node-cron';

/**
 * Housekeeping crons:
 * 1. Daily at 4 AM: Generate cleaning tasks from active schedules
 * 2. Daily at midnight: Mark stale pending tasks as 'missed'
 */
export function startHousekeepingTaskCron() {
  // ── Generate daily tasks (4 AM) ──────────────
  cron.schedule('0 4 * * *', async () => {
    logger.info('[HK Cron] Generating daily cleaning tasks...');
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
      const dayOfMonth = today.getDate();

      const schedules = await prisma.cleaningSchedule.findMany({
        where: { status: 'active' },
      });

      let created = 0;
      for (const sched of schedules) {
        let shouldCreate = false;

        switch (sched.frequencyType) {
          case 'daily':
            shouldCreate = true;
            break;
          case 'weekly':
            shouldCreate = Array.isArray(sched.daysOfWeek) && (sched.daysOfWeek as number[]).includes(dayOfWeek);
            break;
          case 'monthly':
            shouldCreate = dayOfMonth === 1;
            break;
          default:
            shouldCreate = false;
        }

        if (!shouldCreate) continue;

        // Check if task already exists for today
        const existing = await prisma.cleaningTask.findFirst({
          where: { scheduleId: sched.id, taskDate: new Date(todayStr) },
        });
        if (existing) continue;

        await prisma.cleaningTask.create({
          data: {
            companyId: sched.companyId,
            propertyId: sched.propertyId,
            scheduleId: sched.id,
            zoneId: sched.zoneId,
            assignedToId: sched.assignedToId,
            taskDate: new Date(todayStr),
            scheduledTime: sched.scheduledTime,
            status: 'pending',
          },
        });
        created++;
      }

      logger.info(`[HK Cron] Created ${created} cleaning tasks for ${todayStr}`);
    } catch (err) {
      logger.error('[HK Cron] Task generation failed:', err);
    }
  });

  // ── Mark missed tasks (midnight) ──────────────
  cron.schedule('0 0 * * *', async () => {
    logger.info('[HK Cron] Marking missed cleaning tasks...');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const result = await prisma.cleaningTask.updateMany({
        where: {
          status: 'pending',
          taskDate: { lt: new Date(yesterdayStr) },
        },
        data: { status: 'missed' },
      });

      if (result.count > 0) {
        logger.info(`[HK Cron] Marked ${result.count} tasks as missed`);
      }
    } catch (err) {
      logger.error('[HK Cron] Missed task marking failed:', err);
    }
  });

  logger.info('[HK Cron] Housekeeping task crons registered');
}
