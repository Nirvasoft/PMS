import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { asyncHandler, propertyAccessGuard } from '../../middleware';
import { requirePermission } from '../auth/guards/roleGuard';
import { AppError } from '../../common/errors';
import { generalImportService } from './generalImport.service';

const p = (req: Request, key: string) => req.params[key] as string;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Each import type is gated by the permission of the entity it writes.
const PERMISSIONS: Record<string, { read: string; create: string }> = {
  meter: { read: 'meter.read', create: 'meter.create' },
  unit: { read: 'unit.read', create: 'unit.create' },
  lease: { read: 'leases.read', create: 'leases.create' },
};

const gate = (action: 'read' | 'create') => (req: Request, res: Response, next: NextFunction) => {
  const perm = PERMISSIONS[p(req, 'type')];
  if (!perm) return next(AppError.badRequest('Unknown import type', 'INVALID_IMPORT_TYPE'));
  return requirePermission(perm[action])(req, res, next);
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

generalImportRouter.post('/:type/preview', gate('read'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
  const data = await generalImportService.preview(p(req, 'type'), p(req, 'propertyId'), req.user!.companyId, req.file.buffer);
  res.json({ success: true, data });
}));

generalImportRouter.post('/:type/import', gate('create'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
  const data = await generalImportService.import(p(req, 'type'), p(req, 'propertyId'), req.user!.companyId, req.user!.sub, req.file.buffer);
  res.json({ success: true, data });
}));
