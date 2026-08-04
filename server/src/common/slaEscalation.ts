import cron from 'node-cron';
import { prisma, setTenantContext } from './database';
import { logger } from './logger';
import { emitNotification } from './socket';
import crypto from 'crypto';

/**
 * SLA Escalation Cron — runs every minute.
 *
 * Uses the workflow_sla_jobs table for efficient scheduled processing.
 * Each job has a type: 'reminder', 'breach', or 'escalation'.
 * Jobs are created when tasks with SLA are created (in engine.service.ts).
 *
 * This replaces the old scanning approach — only processes due jobs,
 * not all pending tasks.
 */
export function startSlaEscalationJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Find all due pending SLA jobs
      const dueJobs = await prisma.workflowSlaJob.findMany({
        where: {
          status: 'pending',
          scheduledAt: { lte: now },
        },
        include: {
          task: {
            select: {
              id: true,
              status: true,
              assignedTo: true,
              slaBreached: true,
              remindedAt: true,
              instanceId: true,
              nodeId: true,
              title: true,
              instance: {
                select: {
                  companyId: true,
                  definition: { select: { graph: true } },
                },
              },
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 50,
      });

      if (dueJobs.length === 0) return;

      logger.info(`SLA jobs: processing ${dueJobs.length} due job(s)`);

      for (const job of dueJobs) {
        try {
          const task = job.task;

          // Skip if task already completed
          if (task.status !== 'pending') {
            await prisma.workflowSlaJob.update({
              where: { id: job.id },
              data: { status: 'cancelled', executedAt: now },
            });
            continue;
          }

          await setTenantContext(job.companyId);

          switch (job.type) {
            case 'reminder':
              await processReminder(job.id, task);
              break;
            case 'breach':
              await processBreach(job.id, task);
              break;
            case 'escalation':
              await processEscalation(job.id, task, job.metadata as Record<string, unknown>);
              break;
            default:
              await prisma.workflowSlaJob.update({
                where: { id: job.id },
                data: { status: 'executed', executedAt: now },
              });
          }
        } catch (err: any) {
          logger.error(`SLA job ${job.id} (${job.type}) failed: ${err.message}`);
          // Mark as executed to prevent infinite retries
          await prisma.workflowSlaJob.update({
            where: { id: job.id },
            data: { status: 'executed', executedAt: new Date(), metadata: { error: err.message } as any },
          });
        }
      }
    } catch (err) {
      logger.error('SLA escalation job error:', err);
    }
  });

  logger.info('SLA escalation cron started (every minute, job-based)');
}

// ─── Job Processors ──────────────────────────

type TaskInfo = {
  id: string; status: string; assignedTo: string | null;
  slaBreached: boolean; remindedAt: Date | null;
  instanceId: string; nodeId: string; title: string;
  instance: {
    companyId: string;
    definition: { graph: unknown };
  };
};

async function processReminder(jobId: string, task: TaskInfo) {
  if (task.remindedAt) {
    // Already reminded — mark job done
    await prisma.workflowSlaJob.update({
      where: { id: jobId },
      data: { status: 'executed', executedAt: new Date() },
    });
    return;
  }

  // Mark task as reminded
  await prisma.workflowTask.update({
    where: { id: task.id },
    data: { remindedAt: new Date() },
  });

  // Send reminder notification
  if (task.assignedTo) {
    emitNotification(task.assignedTo, {
      id: crypto.randomUUID(),
      title: '⏰ SLA Reminder',
      body: `Task "${task.title}" is due soon. Please complete it before the deadline.`,
      actionUrl: '/tasks',
    });
  }

  // Record history
  await prisma.workflowHistory.create({
    data: {
      instanceId: task.instanceId,
      taskId: task.id,
      toNodeId: task.nodeId,
      action: 'sla_reminder',
      comments: 'SLA reminder: 2 hours before deadline',
    },
  });

  await prisma.workflowSlaJob.update({
    where: { id: jobId },
    data: { status: 'executed', executedAt: new Date() },
  });

  logger.info(`SLA reminder sent for task ${task.id}`);
}

async function processBreach(jobId: string, task: TaskInfo) {
  if (task.slaBreached) {
    await prisma.workflowSlaJob.update({
      where: { id: jobId },
      data: { status: 'executed', executedAt: new Date() },
    });
    return;
  }

  // Mark task as breached
  await prisma.workflowTask.update({
    where: { id: task.id },
    data: { slaBreached: true },
  });

  // Notify assignee
  if (task.assignedTo) {
    emitNotification(task.assignedTo, {
      id: crypto.randomUUID(),
      title: '⚠️ SLA Breached',
      body: `Task "${task.title}" has exceeded its SLA deadline.`,
      actionUrl: '/tasks',
    });
  }

  // Record history
  await prisma.workflowHistory.create({
    data: {
      instanceId: task.instanceId,
      taskId: task.id,
      toNodeId: task.nodeId,
      action: 'sla_breach',
      comments: 'SLA deadline exceeded',
    },
  });

  await prisma.workflowSlaJob.update({
    where: { id: jobId },
    data: { status: 'executed', executedAt: new Date() },
  });

  logger.info(`SLA breach marked for task ${task.id}`);
}

async function processEscalation(jobId: string, task: TaskInfo, metadata: Record<string, unknown>) {
  const escalateTo = metadata?.escalateTo as string;

  if (!escalateTo || task.slaBreached) {
    // If already breached/escalated by earlier job or no target, just mark done
    if (!escalateTo) {
      await prisma.workflowSlaJob.update({
        where: { id: jobId },
        data: { status: 'executed', executedAt: new Date() },
      });
      return;
    }
  }


  let escalationUserId: string | null = null;

  if (escalateTo.startsWith('role:')) {
    const roleName = escalateTo.slice(5);
    const userRole = await prisma.userRole.findFirst({
      where: {
        role: { name: { equals: roleName, mode: 'insensitive' }, companyId: task.instance.companyId },
        user: { isActive: true },
      },
      select: { userId: true },
    });
    escalationUserId = userRole?.userId ?? null;
  } else if (escalateTo.startsWith('user:')) {
    escalationUserId = escalateTo.slice(5);
  }

  if (!escalationUserId) {
    await prisma.workflowSlaJob.update({
      where: { id: jobId },
      data: { status: 'executed', executedAt: new Date() },
    });
    return;
  }

  // Reassign task + mark escalated
  await prisma.workflowTask.update({
    where: { id: task.id },
    data: {
      slaBreached: true,
      escalatedAt: new Date(),
      escalatedTo: escalationUserId,
      assignedTo: escalationUserId,
    },
  });

  // Notify escalation target
  emitNotification(escalationUserId, {
    id: crypto.randomUUID(),
    title: '🔺 Task Escalated to You',
    body: `Task "${task.title}" has been escalated to you due to SLA breach.`,
    actionUrl: '/tasks',
  });

  // Notify original assignee
  if (task.assignedTo && task.assignedTo !== escalationUserId) {
    emitNotification(task.assignedTo, {
      id: crypto.randomUUID(),
      title: '🔺 Task Escalated',
      body: `Task "${task.title}" has been escalated due to SLA breach.`,
      actionUrl: '/tasks',
    });
  }

  // Record history
  await prisma.workflowHistory.create({
    data: {
      instanceId: task.instanceId,
      taskId: task.id,
      toNodeId: task.nodeId,
      action: 'sla_escalation',
      performedBy: escalationUserId,
      comments: `Escalated to ${escalateTo} after SLA breach`,
    },
  });

  await prisma.workflowSlaJob.update({
    where: { id: jobId },
    data: { status: 'executed', executedAt: new Date() },
  });

  logger.info(`SLA escalation: task ${task.id} reassigned to ${escalationUserId}`);
}
