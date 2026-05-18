import cron from 'node-cron';
import { prisma } from './database';
import { logger } from './logger';
import { emitNotification } from './socket';

/**
 * Runs every 5 minutes.
 * Finds workflow tasks that have exceeded their SLA and escalates them:
 * 1. Marks the task as 'escalated'
 * 2. Emits a real-time WS notification to the escalation target if configured
 */
export function startSlaEscalationJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();

      // Find tasks that are pending/in_progress and past their SLA deadline
      const overdueTasksRaw = await prisma.$queryRaw<{
        id: string;
        assigned_to: string | null;
        definition_id: string;
        step_key: string;
        data: unknown;
      }[]>`
        SELECT wt.id, wt.assigned_to, wt.definition_id, wt.step_key, wt.data
        FROM workflow_tasks wt
        WHERE wt.status IN ('pending', 'in_progress')
          AND wt.sla_deadline IS NOT NULL
          AND wt.sla_deadline < ${now}
          AND wt.escalated_at IS NULL
        LIMIT 50
      `;

      if (overdueTasksRaw.length === 0) return;

      logger.info(`SLA escalation: processing ${overdueTasksRaw.length} overdue tasks`);

      for (const task of overdueTasksRaw) {
        // Mark escalated
        await prisma.$executeRaw`
          UPDATE workflow_tasks
          SET escalated_at = ${now}, updated_at = ${now}
          WHERE id = ${task.id}::uuid
        `;

        // Notify assignee about SLA breach
        if (task.assigned_to) {
          emitNotification(task.assigned_to, {
            id: `sla_${task.id}`,
            title: '⚠️ SLA Breach — Task Overdue',
            body: `A workflow task assigned to you has exceeded its SLA deadline and requires immediate attention.`,
            icon: 'warning',
            actionUrl: '/tasks',
          });

          // Create an in-app notification record
          const assigneeUser = await prisma.user.findUnique({ where: { id: task.assigned_to }, select: { companyId: true } });
          if (assigneeUser) {
            await prisma.inAppNotification.create({
              data: {
                userId: task.assigned_to,
                companyId: assigneeUser.companyId,
                title: '⚠️ SLA Breach — Task Overdue',
                body: 'A workflow task assigned to you has exceeded its SLA deadline.',
                icon: 'warning',
                actionUrl: '/tasks',
              },
            });
          }
        }

        logger.warn(`SLA breach: task=${task.id} stepKey=${task.step_key}`);
      }
    } catch (err) {
      logger.error('SLA escalation job error:', err);
    }
  });

  logger.info('SLA escalation cron started (every 5 minutes)');
}
