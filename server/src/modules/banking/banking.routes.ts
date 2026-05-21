import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { bankingService } from './banking.service';

const p = (req: Request, key: string) => req.params[key] as string;

export const bankingRouter = Router();

// ── Bank Accounts ─────────────────────────────
bankingRouter.get('/bank-accounts', asyncHandler(async (req, res) => {
  const data = await bankingService.getBankAccounts(req.user!.companyId);
  res.json({ success: true, data });
}));

bankingRouter.post('/bank-accounts', asyncHandler(async (req, res) => {
  const data = await bankingService.createBankAccount(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

bankingRouter.put('/bank-accounts/:id', asyncHandler(async (req, res) => {
  const data = await bankingService.updateBankAccount(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

bankingRouter.get('/bank-accounts/:id/balance', asyncHandler(async (req, res) => {
  const data = await bankingService.getBalance(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ── Statement Import ──────────────────────────
bankingRouter.post('/bank-accounts/:id/reconcile', asyncHandler(async (req, res) => {
  const data = await bankingService.importStatement(
    req.user!.companyId, req.user!.sub, p(req, 'id'), req.body,
  );
  res.status(201).json({ success: true, data });
}));

bankingRouter.get('/bank-accounts/:id/imports', asyncHandler(async (req, res) => {
  const data = await bankingService.getImports(req.user!.companyId, p(req, 'id'));
  res.json({ success: true, data });
}));

bankingRouter.get('/bank-accounts/:id/statement-lines', asyncHandler(async (req, res) => {
  const result = await bankingService.getStatementLines(req.user!.companyId, p(req, 'id'), req.query);
  res.json({ success: true, ...result });
}));

bankingRouter.get('/bank-accounts/:id/reconciliation-summary', asyncHandler(async (req, res) => {
  const data = await bankingService.getReconciliationSummary(p(req, 'id'));
  res.json({ success: true, data });
}));

// ── Matching ──────────────────────────────────
bankingRouter.post('/bank-statement-lines/:id/match', asyncHandler(async (req, res) => {
  const data = await bankingService.matchLine(p(req, 'id'), req.user!.sub, req.body);
  res.json({ success: true, data });
}));

bankingRouter.post('/bank-statement-lines/:id/exclude', asyncHandler(async (req, res) => {
  const data = await bankingService.excludeLine(p(req, 'id'), req.user!.sub);
  res.json({ success: true, data });
}));

bankingRouter.post('/bank-statement-lines/:id/unmatch', asyncHandler(async (req, res) => {
  const data = await bankingService.unmatchLine(p(req, 'id'));
  res.json({ success: true, data });
}));
