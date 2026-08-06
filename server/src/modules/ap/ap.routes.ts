import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { apInvoicesService } from './apInvoices.service';
import { paymentVouchersService } from './paymentVouchers.service';
import { expensesService } from './expenses.service';
import {
  createApInvoiceSchema, rejectApInvoiceSchema,
  createPaymentVoucherSchema, markVoucherPaidSchema,
  createExpenseSchema,
} from './ap.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ════════════════════════════════════════════════
// AP INVOICES — /api/v1/ap/invoices
// ════════════════════════════════════════════════
export const apInvoicesRouter = Router();

apInvoicesRouter.get('/', asyncHandler(async (req, res) => {
  const result = await apInvoicesService.findAll(req.user!.companyId, {
    vendorName: req.query.vendorName as string,
    status: req.query.status as string,
    propertyId: req.query.propertyId as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

apInvoicesRouter.post('/', validateRequest(createApInvoiceSchema), asyncHandler(async (req, res) => {
  const data = await apInvoicesService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

apInvoicesRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await apInvoicesService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

apInvoicesRouter.post('/:id/approve', asyncHandler(async (req, res) => {
  const data = await apInvoicesService.approve(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

apInvoicesRouter.post('/:id/reject', validateRequest(rejectApInvoiceSchema), asyncHandler(async (req, res) => {
  const data = await apInvoicesService.reject(p(req, 'id'), req.user!.companyId, req.body.reason);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// PAYMENT VOUCHERS — /api/v1/ap/payment-vouchers
// ════════════════════════════════════════════════
export const paymentVouchersRouter = Router();

paymentVouchersRouter.get('/', asyncHandler(async (req, res) => {
  const result = await paymentVouchersService.findAll(req.user!.companyId, {
    status: req.query.status as string,
    vendorName: req.query.vendorName as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

paymentVouchersRouter.post('/', validateRequest(createPaymentVoucherSchema), asyncHandler(async (req, res) => {
  const data = await paymentVouchersService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

paymentVouchersRouter.post('/:id/mark-paid', validateRequest(markVoucherPaidSchema), asyncHandler(async (req, res) => {
  const data = await paymentVouchersService.markPaid(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// EXPENSES — /api/v1/expenses
// ════════════════════════════════════════════════
export const expensesRouter = Router();

expensesRouter.get('/', asyncHandler(async (req, res) => {
  const result = await expensesService.findAll(req.user!.companyId, {
    status: req.query.status as string,
    category: req.query.category as string,
    departmentId: req.query.departmentId as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

expensesRouter.post('/', validateRequest(createExpenseSchema), asyncHandler(async (req, res) => {
  const data = await expensesService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

expensesRouter.post('/:id/approve', asyncHandler(async (req, res) => {
  const data = await expensesService.approve(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// AP REPORTS — /api/v1/ap
// ════════════════════════════════════════════════
export const apReportsRouter = Router();

apReportsRouter.get('/due-payments', asyncHandler(async (req, res) => {
  const data = await apInvoicesService.getDuePayments(req.user!.companyId, {
    dueBefore: req.query.dueBefore as string,
    propertyId: req.query.propertyId as string,
  });
  res.json({ success: true, data });
}));

apReportsRouter.get('/expense-report', asyncHandler(async (req, res) => {
  const data = await expensesService.getExpenseReport(req.user!.companyId, {
    departmentId: req.query.departmentId as string,
    from: req.query.from as string,
    to: req.query.to as string,
    groupBy: req.query.groupBy as string,
  });
  res.json({ success: true, data });
}));
