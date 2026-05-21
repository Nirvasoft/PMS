import cron from 'node-cron';
import { prisma, setTenantContext } from './database';
import { logger } from './logger';
import { emitNotification } from './socket';

/**
 * Runs every 5 minutes.
 * Finds workflow tasks that have exceeded their SLA and escalates them:
 * 1. Marks the task as 'escalated'
 * 2. Emits a real-time WS notification to the escalation target if configured
 * 
 * Multi-tenant: iterates over all active companies.
 */
export function startSlaEscalationJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      for (const company of companies) {
        try {
          await setTenantContext(company.id);

          const now = new Date();

          // Find tasks that are pending/in_progress and past their SLA deadline
          // workflow_tasks is not RLS-protected, but we filter by company's workflow instances
          const overdueTasksRaw = await prisma.$queryRaw<{
            id: string;
            assigned_to: string | null;
            definition_id: string;
            step_key: string;
            data: unknown;
          }[]>`
            SELECT wt.id, wt.assigned_to, wt.definition_id, wt.step_key, wt.data
            FROM workflow_tasks wt
            JOIN workflow_instances wi ON wi.id = wt.instance_id
            WHERE wi.company_id = ${company.id}::uuid
              AND wt.status IN ('pending', 'in_progress')
              AND wt.sla_deadline IS NOT NULL
              AND wt.sla_deadline < ${now}
              AND wt.escalated_at IS NULL
            LIMIT 50
          `;

          if (overdueTasksRaw.length === 0) continue;

          logger.info(`SLA escalation (${company.code}): processing ${overdueTasksRaw.length} overdue tasks`);

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

              // Create an in-app notification record (RLS context is already set)
              await prisma.inAppNotification.create({
                data: {
                  userId: task.assigned_to,
                  companyId: company.id,
                  title: '⚠️ SLA Breach — Task Overdue',
                  body: 'A workflow task assigned to you has exceeded its SLA deadline.',
                  icon: 'warning',
                  actionUrl: '/tasks',
                },
              });
            }

            logger.warn(`SLA breach: task=${task.id} stepKey=${task.step_key} (${company.code})`);
          }
        } catch (err: any) {
          logger.error(`SLA escalation error for company ${company.code}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error('SLA escalation job error:', err);
    }
  });

  logger.info('SLA escalation cron started (every 5 minutes)');
}
