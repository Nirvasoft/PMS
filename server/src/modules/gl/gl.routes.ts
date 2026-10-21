import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { glService } from './gl.service';
import {
  createAccountSchema, updateAccountSchema,
  createDepartmentCenterSchema, updateDepartmentCenterSchema,
  createCostCenterSchema, updateCostCenterSchema,
  createPaymentMethodSchema, updatePaymentMethodSchema,
  createFiscalPeriodSchema,
  createJournalEntrySchema,
} from './gl.schema';

const p = (req: Request, key: string) => req.params[key] as string;
const q = (req: Request, key: string) => (req.query[key] as string) || '';

// ════════════════════════════════════════════════
// CHART OF ACCOUNTS — /api/v1/gl/accounts
// ════════════════════════════════════════════════
export const glRouter = Router();

glRouter.get('/accounts', asyncHandler(async (req, res) => {
  const data = await glService.getAccounts(req.user!.companyId, {
    accountType: q(req, 'accountType') || undefined,
    tree: req.query.tree === 'true',
  });
  res.json({ success: true, data });
}));

glRouter.post('/accounts', validateRequest(createAccountSchema), asyncHandler(async (req, res) => {
  const data = await glService.createAccount(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/accounts/:id', validateRequest(updateAccountSchema), asyncHandler(async (req, res) => {
  const data = await glService.updateAccount(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// DEPARTMENT CENTERS — /api/v1/gl/department-centers
// ════════════════════════════════════════════════

glRouter.get('/department-centers', asyncHandler(async (req, res) => {
  const isActiveParam = q(req, 'isActive');
  const data = await glService.getDepartmentCenters(req.user!.companyId, {
    isActive: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
    search: q(req, 'search') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.post('/department-centers', validateRequest(createDepartmentCenterSchema), asyncHandler(async (req, res) => {
  const data = await glService.createDepartmentCenter(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/department-centers/:id', validateRequest(updateDepartmentCenterSchema), asyncHandler(async (req, res) => {
  const data = await glService.updateDepartmentCenter(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

glRouter.delete('/department-centers/:id', asyncHandler(async (req, res) => {
  const data = await glService.deleteDepartmentCenter(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// COST CENTERS — /api/v1/gl/cost-centers
// ════════════════════════════════════════════════

glRouter.get('/cost-centers', asyncHandler(async (req, res) => {
  const isActiveParam = q(req, 'isActive');
  const data = await glService.getCostCenters(req.user!.companyId, {
    isActive: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
    departmentCenterId: q(req, 'departmentCenterId') || undefined,
    search: q(req, 'search') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.post('/cost-centers', validateRequest(createCostCenterSchema), asyncHandler(async (req, res) => {
  const data = await glService.createCostCenter(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/cost-centers/:id', validateRequest(updateCostCenterSchema), asyncHandler(async (req, res) => {
  const data = await glService.updateCostCenter(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

glRouter.delete('/cost-centers/:id', asyncHandler(async (req, res) => {
  const data = await glService.deleteCostCenter(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// PAYMENT METHODS — /api/v1/gl/payment-methods
// ════════════════════════════════════════════════

glRouter.get('/payment-methods', asyncHandler(async (req, res) => {
  const isActiveParam = q(req, 'isActive');
  const data = await glService.getPaymentMethods(req.user!.companyId, {
    isActive: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
    search: q(req, 'search') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.post('/payment-methods', validateRequest(createPaymentMethodSchema), asyncHandler(async (req, res) => {
  const data = await glService.createPaymentMethod(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/payment-methods/:id', validateRequest(updatePaymentMethodSchema), asyncHandler(async (req, res) => {
  const data = await glService.updatePaymentMethod(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

glRouter.delete('/payment-methods/:id', asyncHandler(async (req, res) => {
  const data = await glService.deletePaymentMethod(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// FISCAL PERIODS — /api/v1/gl/fiscal-periods
// ════════════════════════════════════════════════

glRouter.get('/fiscal-periods', asyncHandler(async (req, res) => {
  const data = await glService.getFiscalPeriods(req.user!.companyId);
  res.json({ success: true, data });
}));

glRouter.post('/fiscal-periods', validateRequest(createFiscalPeriodSchema), asyncHandler(async (req, res) => {
  const data = await glService.createFiscalPeriod(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.post('/fiscal-periods/generate', asyncHandler(async (req, res) => {
  const year = parseInt(req.body.year);
  if (!year || year < 2020 || year > 2099) throw new Error('Invalid year (2020-2099)');
  const data = await glService.generateFiscalYear(req.user!.companyId, year);
  res.json({ success: true, data });
}));

glRouter.post('/fiscal-periods/:id/close', asyncHandler(async (req, res) => {
  const data = await glService.closeFiscalPeriod(p(req, 'id'), req.user!.sub);
  res.json({ success: true, data });
}));

glRouter.post('/fiscal-periods/:id/reopen', asyncHandler(async (req, res) => {
  const data = await glService.reopenFiscalPeriod(p(req, 'id'));
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// JOURNAL ENTRIES — /api/v1/gl/journal-entries
// ════════════════════════════════════════════════

glRouter.get('/journal-entries', asyncHandler(async (req, res) => {
  const result = await glService.getJournalEntries(req.user!.companyId, req.query);
  res.json({ success: true, ...result });
}));

glRouter.get('/journal-entries/:id', asyncHandler(async (req, res) => {
  const data = await glService.getJournalEntry(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

glRouter.post('/journal-entries', validateRequest(createJournalEntrySchema), asyncHandler(async (req, res) => {
  const data = await glService.createJournalEntry(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.post('/journal-entries/:id/post', asyncHandler(async (req, res) => {
  const data = await glService.postJournalEntry(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

glRouter.post('/journal-entries/:id/reverse', asyncHandler(async (req, res) => {
  const data = await glService.reverseJournalEntry(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// REPORTS — /api/v1/gl/trial-balance, /gl/reports/*
// ════════════════════════════════════════════════

glRouter.get('/trial-balance', asyncHandler(async (req, res) => {
  const data = await glService.getTrialBalance(req.user!.companyId, {
    fromDate: q(req, 'fromDate') || undefined,
    toDate: q(req, 'toDate') || undefined,
    propertyId: q(req, 'propertyId') || undefined,
  });

  if (req.query.format === 'csv') {
    const header = 'Code,Account Name,Type,Subtype,Total Debit,Total Credit,Net Balance\n';
    const rows = data.rows.map(r =>
      `"${r.code}","${r.name}","${r.accountType}","${r.accountSubtype || ''}",${r.totalDebit.toFixed(2)},${r.totalCredit.toFixed(2)},${r.netBalance.toFixed(2)}`
    ).join('\n');
    const totals = `\n"","TOTALS","","",${data.summary.totalDebit.toFixed(2)},${data.summary.totalCredit.toFixed(2)},""`;
    const balanced = `\n"","Balanced: ${data.summary.isBalanced ? 'YES' : 'NO'}"`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trial-balance-${q(req, 'toDate') || 'current'}.csv"`);
    return res.send(header + rows + totals + balanced);
  }

  res.json({ success: true, data });
}));

glRouter.get('/reports/pnl', asyncHandler(async (req, res) => {
  const data = await glService.getProfitAndLoss(req.user!.companyId, {
    fromDate: q(req, 'fromDate') || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    toDate: q(req, 'toDate') || new Date().toISOString().split('T')[0],
    propertyId: q(req, 'propertyId') || undefined,
    compareFromDate: q(req, 'compareFromDate') || undefined,
    compareToDate: q(req, 'compareToDate') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.get('/reports/balance-sheet', asyncHandler(async (req, res) => {
  const data = await glService.getBalanceSheet(req.user!.companyId, {
    asOfDate: q(req, 'asOfDate') || new Date().toISOString().split('T')[0],
    propertyId: q(req, 'propertyId') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.get('/reports/cash-flow', asyncHandler(async (req, res) => {
  const data = await glService.getCashFlow(req.user!.companyId, {
    fromDate: q(req, 'fromDate') || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    toDate: q(req, 'toDate') || new Date().toISOString().split('T')[0],
    propertyId: q(req, 'propertyId') || undefined,
  });
  res.json({ success: true, data });
}));
