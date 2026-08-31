import { prisma } from '../../../common/database';
import { logger } from '../../../common/logger';
import cron from 'node-cron';
import { pmService } from '../pm.service';

/**
 * Daily cron (6:00 AM): Generate PM work orders for upcoming schedules
 * and mark overdue PM work orders.
 */
export function startPmGeneratorJob() {
  // Generate WOs for due PM schedules (daily at 6 AM)
  cron.schedule('0 6 * * *', async () => {
    logger.info('[PM Cron] Running PM work order generation...');
    try {
      const todayStr = new Date().toISOString().split('T')[0];

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
          // Use the service method which creates ticket + assigns tech + creates PM WO
          await pmService.generateWorkOrder(sched.id, sched.company_id);
          created++;
        } catch (err: any) {
          // Skip "already exists" errors (idempotency)
          if (err?.message?.includes('already exists')) continue;
          logger.warn(`[PM Cron] Failed to generate WO for schedule ${sched.id}: ${err.message}`);
        }
      }

      if (created > 0) {
        logger.info(`[PM Cron] Created ${created} PM work orders with linked tickets`);
      }
    } catch (err) {
      logger.error(`[PM Cron] Generation error: ${err}`);
    }
  });

  // Mark overdue PM work orders (daily at midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Find WOs that will be marked overdue (before updating)
      const overdueWos = await prisma.pmWorkOrder.findMany({
        where: { status: 'scheduled', dueDate: { lt: new Date(todayStr) } },
        select: {
          id: true, companyId: true,
          schedule: { select: { name: true, priority: true, propertyId: true, property: { select: { name: true } } } },
        },
      });

      const result = await prisma.pmWorkOrder.updateMany({
        where: { status: 'scheduled', dueDate: { lt: new Date(todayStr) } },
        data: { status: 'overdue' },
      });

      if (result.count > 0) {
        logger.info(`[PM Cron] Marked ${result.count} PM work orders as overdue`);

        // Group by company and notify admins
        const byCompany = new Map<string, typeof overdueWos>();
        for (const wo of overdueWos) {
          if (!byCompany.has(wo.companyId)) byCompany.set(wo.companyId, []);
          byCompany.get(wo.companyId)!.push(wo);
        }

        for (const [companyId, wos] of byCompany) {
          try {
            const admins = await prisma.user.findMany({
              where: { companyId, isActive: true, userRoles: { some: { role: { name: { in: ['Admin', 'Super Admin', 'Property Manager'] } } } } },
              select: { id: true },
            });
            if (admins.length === 0) continue;

            const { notificationService } = await import('../../notifications/services/notification.service');
            await notificationService.send({
              templateCode: 'pm_overdue',
              companyId,
              recipientIds: admins.map(a => a.id),
              channels: ['in_app', 'push'],
              variables: {
                count: wos.length,
                scheduleNames: wos.slice(0, 3).map(w => w.schedule.name).join(', '),
                propertyName: wos[0]?.schedule.property?.name || 'Multiple',
              },
              entityType: 'maintenance_ticket',
              entityId: wos[0]?.id || '',
            }).catch((err: any) => logger.warn(`PM overdue notification failed: ${err.message}`));
          } catch (err: any) {
            logger.warn(`[PM Cron] Notification error for company ${companyId}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      logger.error(`[PM Cron] Overdue check error: ${err}`);
    }
  });

  logger.info('🔧 PM generator cron jobs started (6:00 AM generation, midnight overdue check)');
}
