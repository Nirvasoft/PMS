import { Router, Request } from 'express';
import multer from 'multer';
import { asyncHandler, propertyAccessGuard } from '../../middleware';
import { requirePermission } from '../auth/guards/roleGuard';
import { AppError } from '../../common/errors';
import { meterRecordsService } from './meterRecords.service';

const p = (req: Request, key: string) => req.params[key] as string;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ════════════════════════════════════════════════
// METER RECORDS — nested under /properties/:propertyId/meter-records
// ════════════════════════════════════════════════
export const meterRecordsRouter = Router({ mergeParams: true });
meterRecordsRouter.use(propertyAccessGuard);

/** GET /properties/:propertyId/meter-records/export?billDate=YYYY-MM-DD&occupiedOnly=true */
meterRecordsRouter.get('/export', requirePermission('meter.read'), asyncHandler(async (req, res) => {
  const billDate = req.query.billDate as string | undefined;
  if (!billDate) throw AppError.badRequest('billDate query param is required', 'BILL_DATE_REQUIRED');
  const occupiedOnly = req.query.occupiedOnly === 'true';
  const { buffer, filename } = await meterRecordsService.exportTemplate(p(req, 'propertyId'), req.user!.companyId, billDate, occupiedOnly);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}));

/** POST /properties/:propertyId/meter-records/preview — parses the file, writes nothing. */
meterRecordsRouter.post('/preview', requirePermission('meter.read'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
  const data = await meterRecordsService.previewExcel(p(req, 'propertyId'), req.user!.companyId, req.file.buffer);
  res.json({ success: true, data });
}));

/** POST /properties/:propertyId/meter-records/import */
meterRecordsRouter.post('/import', requirePermission('meter.create'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
  const data = await meterRecordsService.importExcel(p(req, 'propertyId'), req.user!.companyId, req.user!.sub, req.file.buffer);
  res.json({ success: true, data });
}));
