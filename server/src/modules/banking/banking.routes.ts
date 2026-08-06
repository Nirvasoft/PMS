import { Router, Request, raw } from 'express';
import { asyncHandler } from '../../middleware';
import { bankingService } from './banking.service';
import { paymentGatewayService } from './paymentGateway.service';

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

// ═══════════════════════════════════════════════
// PAYMENT GATEWAY TRANSACTIONS
// ═══════════════════════════════════════════════

bankingRouter.get('/gateway-transactions', asyncHandler(async (req, res) => {
  const result = await paymentGatewayService.findAll(req.user!.companyId, {
    gateway: req.query.gateway as string,
    status: req.query.status as string,
    tenantId: req.query.tenantId as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
  });
  res.json({ success: true, ...result });
}));

bankingRouter.get('/gateway-transactions/summary', asyncHandler(async (req, res) => {
  const data = await paymentGatewayService.getSummary(req.user!.companyId);
  res.json({ success: true, data });
}));

bankingRouter.get('/gateway-transactions/:id', asyncHandler(async (req, res) => {
  const data = await paymentGatewayService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

bankingRouter.post('/gateway-transactions/initiate', asyncHandler(async (req, res) => {
  const data = await paymentGatewayService.initiate(req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

bankingRouter.post('/gateway-transactions/:id/confirm', asyncHandler(async (req, res) => {
  const data = await paymentGatewayService.confirm(p(req, 'id'), req.body);
  res.json({ success: true, data });
}));

bankingRouter.post('/gateway-transactions/:id/refund', asyncHandler(async (req, res) => {
  const data = await paymentGatewayService.refund(p(req, 'id'), req.user!.companyId, req.body.reason || 'Refund');
  res.json({ success: true, data });
}));

// ═══════════════════════════════════════════════
// STRIPE WEBHOOK (public — no auth middleware)
// ═══════════════════════════════════════════════
export const stripeWebhookRouter = Router();

/**
 * POST /api/v1/webhooks/stripe
 *
 * Receives Stripe webhook events with raw body for signature verification.
 * Mount BEFORE express.json() middleware or use express.raw() as shown.
 *
 * Handled events:
 *  - checkout.session.completed → mark completed, update invoice
 *  - checkout.session.expired   → mark failed
 *  - payment_intent.payment_failed → mark failed
 *  - charge.refunded           → mark refunded, reverse invoice
 */
stripeWebhookRouter.post(
  '/stripe',
  raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      res.status(400).json({ success: false, message: 'Missing Stripe-Signature header' });
      return;
    }

    const result = await paymentGatewayService.handleStripeWebhook(req.body, signature);
    res.json({ success: true, ...result });
  }),
);
