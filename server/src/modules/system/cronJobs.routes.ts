import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { cronManager } from '../../common/cronManager.service';
import { AppError } from '../../common/errors';

export const cronJobsRouter = Router();

// GET /api/v1/developer/cron-jobs
cronJobsRouter.get('/', asyncHandler(async (_req, res) => {
  const jobs = await cronManager.listJobs();
  res.json({ success: true, data: jobs });
}));

// PATCH /api/v1/developer/cron-jobs/:jobKey
cronJobsRouter.patch('/:jobKey', asyncHandler(async (req, res) => {
  const jobKey = String(req.params.jobKey);
  const { cronExpression, timezone, isEnabled } = req.body;
  const userEmail = (req as any).user?.email || 'admin';

  let result;
  if (typeof isEnabled === 'boolean' && cronExpression === undefined) {
    result = await cronManager.toggle(jobKey, isEnabled, userEmail);
  } else if (cronExpression) {
    result = await cronManager.reschedule(jobKey, cronExpression, timezone, userEmail);
    if (typeof isEnabled === 'boolean') {
      result = await cronManager.toggle(jobKey, isEnabled, userEmail);
    }
  } else {
    throw AppError.validation('Must provide either cronExpression or isEnabled');
  }

  res.json({ success: true, data: result });
}));

// POST /api/v1/developer/cron-jobs/:jobKey/run-now
cronJobsRouter.post('/:jobKey/run-now', asyncHandler(async (req, res) => {
  const jobKey = String(req.params.jobKey);
  const userEmail = (req as any).user?.email || 'admin';

  const result = await cronManager.executeJob(jobKey, `manual:${userEmail}`);
  if (!result.success && result.error === 'Job is already currently running') {
    return res.status(409).json({ success: false, message: result.error });
  }

  res.json({
    success: result.success,
    message: result.message || result.error,
    data: result,
  });
}));

// GET /api/v1/developer/cron-jobs/:jobKey/logs
cronJobsRouter.get('/:jobKey/logs', asyncHandler(async (req, res) => {
  const jobKey = String(req.params.jobKey);
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const result = await cronManager.getLogs(jobKey, limit, page);
  res.json({ success: true, ...result });
}));
