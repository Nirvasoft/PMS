import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { receiptsService } from './receipts.service';
import { refundsService } from './refunds.service';
import { tenantCreditsService } from './tenantCredits.service';
import {
  createReceiptSchema, reverseReceiptSchema,
  createRefundSchema, rejectRefundSchema, markRefundPaidSchema,
} from './ar.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ════════════════════════════════════════════════
// RECEIPTS — /api/v1/receipts
// ════════════════════════════════════════════════
export const receiptsRouter = Router();

receiptsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await receiptsService.findAll(req.user!.companyId, {
    tenantId: req.query.tenantId as string,
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

receiptsRouter.post('/', validateRequest(createReceiptSchema), asyncHandler(async (req, res) => {
  const data = await receiptsService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

receiptsRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await receiptsService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

receiptsRouter.post('/:id/reverse', validateRequest(reverseReceiptSchema), asyncHandler(async (req, res) => {
  const data = await receiptsService.reverse(p(req, 'id'), req.user!.companyId, req.body.reason, req.user!.sub);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// AR REPORTS — /api/v1/ar
// ════════════════════════════════════════════════
export const arReportsRouter = Router();

arReportsRouter.get('/aging-report', asyncHandler(async (req, res) => {
  const data = await receiptsService.getAgingReport(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    asOfDate: req.query.asOfDate as string,
  });
  res.json({ success: true, data });
}));

arReportsRouter.get('/aging-report/csv', asyncHandler(async (req, res) => {
  const data = await receiptsService.getAgingReport(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
    asOfDate: req.query.asOfDate as string,
  });
  const csv = receiptsService.generateAgingCsv(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="aging-report-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
}));

arReportsRouter.get('/collection-summary', asyncHandler(async (req, res) => {
  const data = await receiptsService.getCollectionSummary(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
  });
  res.json({ success: true, data });
}));

arReportsRouter.get('/outstanding-by-property', asyncHandler(async (req, res) => {
  const data = await receiptsService.getOutstandingByProperty(req.user!.companyId);
  res.json({ success: true, data });
}));

arReportsRouter.get('/overdue-trend', asyncHandler(async (req, res) => {
  const data = await receiptsService.getOverdueTrend(req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// REFUNDS — /api/v1/refunds
// ════════════════════════════════════════════════
export const refundsRouter = Router();

refundsRouter.get('/', asyncHandler(async (req, res) => {
  const result = await refundsService.findAll(req.user!.companyId, {
    tenantId: req.query.tenantId as string,
    status: req.query.status as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

refundsRouter.post('/', validateRequest(createRefundSchema), asyncHandler(async (req, res) => {
  const data = await refundsService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

refundsRouter.post('/:id/approve', asyncHandler(async (req, res) => {
  const data = await refundsService.approve(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

refundsRouter.post('/:id/reject', validateRequest(rejectRefundSchema), asyncHandler(async (req, res) => {
  const data = await refundsService.reject(p(req, 'id'), req.user!.companyId, req.body.reason, req.user!.sub);
  res.json({ success: true, data });
}));

refundsRouter.post('/:id/mark-paid', validateRequest(markRefundPaidSchema), asyncHandler(async (req, res) => {
  const data = await refundsService.markPaid(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// TENANT CREDITS — /api/v1/tenants/:tenantId/credits
// ════════════════════════════════════════════════
export const tenantCreditsRouter = Router({ mergeParams: true });

tenantCreditsRouter.get('/:tenantId/credits', asyncHandler(async (req, res) => {
  const data = await tenantCreditsService.findByTenant(req.user!.companyId, p(req, 'tenantId'));
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// TENANT STATEMENT — /api/v1/tenants/:tenantId/statement
// ════════════════════════════════════════════════
export const tenantStatementRouter = Router({ mergeParams: true });

tenantStatementRouter.get('/:tenantId/statement', asyncHandler(async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  if (!from || !to) {
    res.status(400).json({ success: false, errors: [{ code: 'VALIDATION_ERROR', message: 'from and to query params are required' }] });
    return;
  }
  const data = await receiptsService.getStatement(req.user!.companyId, p(req, 'tenantId'), from, to);
  res.json({ success: true, data });
}));

tenantStatementRouter.get('/:tenantId/statement/pdf', asyncHandler(async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  if (!from || !to) {
    res.status(400).json({ success: false, errors: [{ code: 'VALIDATION_ERROR', message: 'from and to query params are required' }] });
    return;
  }
  const html = await receiptsService.generateStatementHtml(req.user!.companyId, p(req, 'tenantId'), from, to);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));
