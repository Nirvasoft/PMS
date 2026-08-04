import cron from 'node-cron';
import { prisma, setTenantContext } from './database';
import { logger } from './logger';
import { emitNotification } from './socket';

/**
 * SLA Escalation Cron — runs every 5 minutes.
 *
 * Phase 1: Send reminders 2 hours before SLA deadline (tasks not yet reminded).
 * Phase 2: Detect SLA breaches and escalate:
 *   - Mark sla_breached = true, set escalated_at
 *   - Resolve escalateTo from the workflow graph node config
 *   - Reassign the task to the escalation target
 *   - Record history + notify both assignee and escalation target
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

          // ─── Phase 1: SLA Reminders (2h before deadline) ─────────
          await processReminders(company, now);

          // ─── Phase 2: SLA Breach + Escalation ───────────────────
          await processBreaches(company, now);

        } catch (err: any) {
          logger.error(`SLA escalation error for company ${company.code}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error('SLA escalation job error:', err);
    }
  });

  logger.info('SLA escalation cron started (every 5 minutes) — reminders + breach + escalation');
}

/**
 * Phase 1: Find tasks approaching SLA deadline (within 2 hours)
 * that haven't been reminded yet.
 */
async function processReminders(company: { id: string; code: string }, now: Date) {
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const upcomingTasks = await prisma.$queryRaw<{
    id: string;
    assigned_to: string | null;
    delegated_to: string | null;
    title: string;
    sla_due_at: Date;
  }[]>`
    SELECT wt.id, wt.assigned_to, wt.delegated_to, wt.title, wt.sla_due_at
    FROM workflow_tasks wt
    JOIN workflow_instances wi ON wi.id = wt.instance_id
    WHERE wi.company_id = ${company.id}::uuid
      AND wt.status = 'pending'
      AND wt.sla_due_at IS NOT NULL
      AND wt.sla_due_at <= ${twoHoursFromNow}
      AND wt.sla_due_at > ${now}
      AND wt.reminded_at IS NULL
      AND wt.sla_breached = false
    LIMIT 50
  `;

  if (upcomingTasks.length === 0) return;

  logger.info(`SLA reminders (${company.code}): sending ${upcomingTasks.length} reminders`);

  for (const task of upcomingTasks) {
    // Mark as reminded
    await prisma.workflowTask.update({
      where: { id: task.id },
      data: { remindedAt: now },
    });

    const minutesLeft = Math.round((task.sla_due_at.getTime() - now.getTime()) / 60000);
    const hoursLeft = (minutesLeft / 60).toFixed(1);

    // Notify current handler (assignee or delegatee)
    const recipientId = task.delegated_to || task.assigned_to;
    if (recipientId) {
      emitNotification(recipientId, {
        id: `sla_reminder_${task.id}`,
        title: `⏰ SLA Reminder — ${hoursLeft}h left`,
        body: `Task "${task.title}" is due in ${hoursLeft} hours. Please review promptly.`,
        icon: 'clock',
        actionUrl: '/tasks',
      });

      await prisma.inAppNotification.create({
        data: {
          userId: recipientId,
          companyId: company.id,
          title: `⏰ SLA Reminder — ${hoursLeft}h left`,
          body: `Task "${task.title}" is approaching its SLA deadline.`,
          icon: 'clock',
          actionUrl: '/tasks',
        },
      });
    }

    logger.info(`SLA reminder: task=${task.id} minutesLeft=${minutesLeft} (${company.code})`);
  }
}

/**
 * Phase 2: Find tasks that have exceeded their SLA deadline.
 * Mark as breached, resolve escalation target from graph, reassign task.
 */
async function processBreaches(company: { id: string; code: string }, now: Date) {
  const overdueTasksRaw = await prisma.$queryRaw<{
    id: string;
    assigned_to: string | null;
    delegated_to: string | null;
    node_id: string;
    title: string;
    instance_id: string;
  }[]>`
    SELECT wt.id, wt.assigned_to, wt.delegated_to, wt.node_id, wt.title, wt.instance_id
    FROM workflow_tasks wt
    JOIN workflow_instances wi ON wi.id = wt.instance_id
    WHERE wi.company_id = ${company.id}::uuid
      AND wt.status IN ('pending', 'in_progress')
      AND wt.sla_due_at IS NOT NULL
      AND wt.sla_due_at < ${now}
      AND wt.sla_breached = false
    LIMIT 50
  `;

  if (overdueTasksRaw.length === 0) return;

  logger.info(`SLA escalation (${company.code}): processing ${overdueTasksRaw.length} overdue tasks`);

  for (const task of overdueTasksRaw) {
    try {
      // Resolve escalation target from the workflow graph
      const escalationTarget = await resolveEscalationTarget(task.instance_id, task.node_id, company.id);

      // Mark SLA breached + set escalation fields
      const updateData: Record<string, unknown> = {
        slaBreached: true,
        escalatedAt: now,
      };

      if (escalationTarget) {
        updateData.escalatedTo = escalationTarget;
        // Reassign the task to the escalation target
        updateData.assignedTo = escalationTarget;
      }

      await prisma.workflowTask.update({
        where: { id: task.id },
        data: updateData,
      });

      // Record history: SLA breach event
      await prisma.workflowHistory.create({
        data: {
          instanceId: task.instance_id,
          taskId: task.id,
          fromNodeId: task.node_id,
          toNodeId: task.node_id,
          action: 'sla_breach',
          performedBy: null,  // System action
          comments: escalationTarget
            ? `SLA breached. Task escalated and reassigned.`
            : `SLA breached. No escalation target configured.`,
        },
      });

      // Notify the original assignee about the breach
      const originalAssignee = task.delegated_to || task.assigned_to;
      if (originalAssignee) {
        emitNotification(originalAssignee, {
          id: `sla_breach_${task.id}`,
          title: '⚠️ SLA Breach — Task Overdue',
          body: escalationTarget
            ? `Task "${task.title}" has exceeded its SLA and has been escalated.`
            : `Task "${task.title}" has exceeded its SLA deadline. Please act immediately.`,
          icon: 'warning',
          actionUrl: '/tasks',
        });

        await prisma.inAppNotification.create({
          data: {
            userId: originalAssignee,
            companyId: company.id,
            title: '⚠️ SLA Breach — Task Overdue',
            body: `Task "${task.title}" has exceeded its SLA deadline.`,
            icon: 'warning',
            actionUrl: '/tasks',
          },
        });
      }

      // Notify the escalation target (if different from original assignee)
      if (escalationTarget && escalationTarget !== originalAssignee) {
        emitNotification(escalationTarget, {
          id: `sla_escalated_${task.id}`,
          title: '🔺 Task Escalated to You',
          body: `Task "${task.title}" has been escalated to you due to SLA breach.`,
          icon: 'alert-triangle',
          actionUrl: '/tasks',
        });

        await prisma.inAppNotification.create({
          data: {
            userId: escalationTarget,
            companyId: company.id,
            title: '🔺 Task Escalated to You',
            body: `Task "${task.title}" has been escalated to you due to an SLA breach. Please review urgently.`,
            icon: 'alert-triangle',
            actionUrl: '/tasks',
          },
        });
      }

      logger.warn(
        `SLA breach: task=${task.id} nodeId=${task.node_id} ` +
        `escalatedTo=${escalationTarget || 'none'} (${company.code})`
      );
    } catch (err: any) {
      logger.error(`SLA escalation failed for task ${task.id}: ${err.message}`);
    }
  }
}

/**
 * Resolve the escalation target user ID from the workflow graph's node SLA config.
 *
 * Reads the graph from the instance's definition, finds the node config,
 * and resolves `sla.escalateTo` using the same assignment format:
 *   'role:<roleName>' | 'user:<userId>' | 'initiator'
 */
async function resolveEscalationTarget(
  instanceId: string,
  nodeId: string,
  companyId: string,
): Promise<string | null> {
  try {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { definition: { select: { graph: true } } },
    });
    if (!instance) return null;

    const graph = instance.definition.graph as unknown as {
      nodes: { id: string; type: string; data?: { sla?: { escalateTo?: string } } }[];
    };

    const node = graph.nodes.find((n) => n.id === nodeId);
    const escalateTo = node?.data?.sla?.escalateTo;
    if (!escalateTo) return null;

    // Resolve using the same patterns as engine.resolveAssignee
    if (escalateTo === 'initiator') {
      return instance.initiatedBy;
    }

    if (escalateTo.startsWith('user:')) {
      return escalateTo.slice(5);
    }

    if (escalateTo.startsWith('role:')) {
      const roleName = escalateTo.slice(5);
      const userRole = await prisma.userRole.findFirst({
        where: {
          role: { name: { equals: roleName, mode: 'insensitive' }, companyId },
          user: { isActive: true },
        },
        select: { userId: true },
      });
      return userRole?.userId ?? null;
    }

    return null;
  } catch (err: any) {
    logger.error(`Failed to resolve escalation target: ${err.message}`);
    return null;
  }
}

