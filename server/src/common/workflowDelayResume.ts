import cron from 'node-cron';
import { prisma, setTenantContext } from './database';
import { logger } from './logger';
import { WorkflowEngine } from '../modules/workflow/services/engine.service';

const engine = new WorkflowEngine();

/**
 * Workflow Delay Resume Cron — runs every minute.
 *
 * Finds workflow instances that have a delay node which has expired
 * (delayedUntil <= now) and resumes them by advancing past the delay node.
 *
 * Multi-tenant: iterates over all active companies.
 */
export function startWorkflowDelayResumeJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Find all delayed instances across all companies whose delay has expired
      const delayedInstances = await prisma.workflowInstance.findMany({
        where: {
          status: 'running',
          delayedUntil: { lte: now },
          delayNodeId: { not: null },
        },
        select: { id: true, companyId: true },
        take: 20,
      });

      if (delayedInstances.length === 0) return;

      logger.info(`Delay resume: processing ${delayedInstances.length} delayed instance(s)`);

      for (const inst of delayedInstances) {
        try {
          await setTenantContext(inst.companyId);
          await engine.resumeDelayedInstance(inst.id);
          logger.info(`Delay resume: instance ${inst.id} resumed`);
        } catch (err: any) {
          logger.error(`Delay resume failed for instance ${inst.id}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error('Workflow delay resume job error:', err);
    }
  });

  logger.info('Workflow delay resume cron started (every minute)');
}
