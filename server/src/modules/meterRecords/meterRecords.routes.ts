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

// ════════════════════════════════════════════════
// METER RECORDS REPORT — mounted at /api/v1/meter-records
// ════════════════════════════════════════════════
export const meterRecordsReportRouter = Router();

const qStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** GET /api/v1/meter-records/filters?propertyId=... */
meterRecordsReportRouter.get(
  '/filters',
  requirePermission('reports-meter-records.read', 'meter.read'),
  asyncHandler(async (req, res) => {
    const data = await meterRecordsService.getReportFilters(
      req.user!.companyId,
      qStr(req.query.propertyId),
    );
    res.json({ success: true, data });
  }),
);

/** GET /api/v1/meter-records?... */
meterRecordsReportRouter.get(
  '/',
  requirePermission('reports-meter-records.read', 'meter.read'),
  asyncHandler(async (req, res) => {
    const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';
    const result = await meterRecordsService.listReportRecords(req.user!.companyId, {
      propertyId: qStr(req.query.propertyId),
      billDateFrom: qStr(req.query.billDateFrom),
      billDateTo: qStr(req.query.billDateTo),
      startDateFrom: qStr(req.query.startDateFrom),
      endDateTo: qStr(req.query.endDateTo),
      floor: qStr(req.query.floor),
      unitNumber: qStr(req.query.unitNumber),
      tenantCode: qStr(req.query.tenantCode),
      meterType: qStr(req.query.meterType),
      category: qStr(req.query.category),
      meterNo: qStr(req.query.meterNo),
      sortBy: qStr(req.query.sortBy),
      sortOrder,
    });
    res.json({ success: true, ...result });
  }),
);
