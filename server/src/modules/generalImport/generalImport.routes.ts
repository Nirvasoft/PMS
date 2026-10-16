import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { asyncHandler, propertyAccessGuard } from '../../middleware';
import { requirePermission } from '../auth/guards/roleGuard';
import { AppError } from '../../common/errors';
import { generalImportService } from './generalImport.service';

const p = (req: Request, key: string) => {
  const val = req.params[key] as string;
  if (key === 'type' && val === 'charges') return 'charge';
  return val;
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

interface ImportJob {
  id: string;
  companyId: string;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: { message: string; code?: string };
  createdAt: number;
}

const JOB_TTL_MS = 30 * 60 * 1000;
const importJobs = new Map<string, ImportJob>();

function pruneExpiredJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of importJobs.entries()) {
    if (job.createdAt < cutoff) {
      importJobs.delete(id);
    }
  }
}

// Each import type is gated by the permission of the entity it writes.
const PERMISSIONS: Record<string, { read: string | string[]; create: string | string[] }> = {
  meter: { read: 'meter.read', create: 'meter.create' },
  unit: { read: 'unit.read', create: 'unit.create' },
  lease: { read: 'leases.read', create: 'leases.create' },
  tenant: { read: 'tenants.read', create: 'tenants.create' },
  lead: { read: 'crm-leads.read', create: ['crm-leads.create', 'crm-leads.write'] },
  invoice: { read: ['billing-invoices.read', 'billing.read'], create: ['billing-invoices.write', 'billing.create'] },
  charge: {
    read: ['billing-charge-types.read', 'billing.read', 'charge-category.read', 'meter.read', 'leases.read'],
    create: ['billing-charge-types.write', 'billing.create', 'charge-category.create', 'meter.create', 'leases.create'],
  },
};

const gate = (action: 'read' | 'create') => (req: Request, res: Response, next: NextFunction) => {
  const perm = PERMISSIONS[p(req, 'type')];
  if (!perm) return next(AppError.badRequest('Unknown import type', 'INVALID_IMPORT_TYPE'));
  const target = perm[action];
  const perms = Array.isArray(target) ? target : [target];
  return requirePermission(...perms)(req, res, next);
};

/** Mounted at /properties/:propertyId/general-import */
export const generalImportRouter = Router({ mergeParams: true });
generalImportRouter.use(propertyAccessGuard);

generalImportRouter.get('/:type/sample', gate('read'), asyncHandler(async (req, res) => {
  const { buffer, filename } = await generalImportService.buildSample(p(req, 'type'));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}));

generalImportRouter.get('/:type/jobs/:jobId', gate('read'), asyncHandler(async (req, res) => {
  pruneExpiredJobs();
  const jobId = p(req, 'jobId');
  const job = importJobs.get(jobId);
  if (!job || job.companyId !== req.user!.companyId) {
    throw AppError.notFound('Import job not found');
  }
  if (job.status === 'completed' || job.status === 'failed') {
    importJobs.delete(jobId);
  }
  res.json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      result: job.result,
      error: job.error,
    },
  });
}));

generalImportRouter.post('/:type/preview', gate('read'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
  const importType = p(req, 'type');
  const propertyId = p(req, 'propertyId');
  const companyId = req.user!.companyId;
  const fileBuffer = req.file.buffer;

  if (req.query.async === '1') {
    pruneExpiredJobs();
    const jobId = randomUUID();
    const job: ImportJob = { id: jobId, companyId, status: 'running', createdAt: Date.now() };
    importJobs.set(jobId, job);

    setImmediate(async () => {
      try {
        job.result = await generalImportService.preview(importType, propertyId, companyId, fileBuffer);
        job.status = 'completed';
      } catch (err) {
        job.status = 'failed';
        job.error = {
          message: (err as Error)?.message || 'Failed to preview file',
          code: (err as { code?: string })?.code,
        };
      }
    });

    res.status(202).json({ success: true, data: { jobId, status: 'running' } });
    return;
  }

  const data = await generalImportService.preview(importType, propertyId, companyId, fileBuffer);
  res.json({ success: true, data });
}));

generalImportRouter.post('/:type/import', gate('create'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
  const importType = p(req, 'type');
  const propertyId = p(req, 'propertyId');
  const companyId = req.user!.companyId;
  const userId = req.user!.sub;
  const fileBuffer = req.file.buffer;

  if (req.query.async === '1') {
    pruneExpiredJobs();
    const jobId = randomUUID();
    const job: ImportJob = { id: jobId, companyId, status: 'running', createdAt: Date.now() };
    importJobs.set(jobId, job);

    setImmediate(async () => {
      try {
        job.result = await generalImportService.import(importType, propertyId, companyId, userId, fileBuffer);
        job.status = 'completed';
      } catch (err) {
        job.status = 'failed';
        job.error = {
          message: (err as Error)?.message || 'Failed to import file',
          code: (err as { code?: string })?.code,
        };
      }
    });

    res.status(202).json({ success: true, data: { jobId, status: 'running' } });
    return;
  }

  const data = await generalImportService.import(importType, propertyId, companyId, userId, fileBuffer);
  res.json({ success: true, data });
}));
