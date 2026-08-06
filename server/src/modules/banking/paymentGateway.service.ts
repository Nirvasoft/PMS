import Stripe from 'stripe';
import { prisma } from '../../common/database';
import { config } from '../../common/config';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';

// ─────────────────────────────────────────────────
// Stripe Client — lazily initialized
// ─────────────────────────────────────────────────
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!config.stripe.secretKey) {
    throw AppError.validation(
      'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.',
    );
  }
  _stripe = new Stripe(config.stripe.secretKey, {
    apiVersion: config.stripe.apiVersion as Stripe.LatestApiVersion,
  });
  return _stripe;
}

/** Returns true if Stripe SDK is available */
function isStripeConfigured(): boolean {
  return !!config.stripe.secretKey;
}

// ─────────────────────────────────────────────────
// PaymentGatewayService
// ─────────────────────────────────────────────────
class PaymentGatewayService {

  // ══════════════════════════════════════════════
  // QUERY METHODS (unchanged — gateway-agnostic)
  // ══════════════════════════════════════════════

  /** List all transactions (company-wide, paginated) */
  async findAll(companyId: string, filters: {
    gateway?: string; status?: string; tenantId?: string;
    from?: string; to?: string; page?: number; limit?: number;
  }) {
    const { gateway, status, tenantId, from, to, page = 1, limit = 20 } = filters;
    const where: any = { companyId };
    if (gateway) where.gateway = gateway;
    if (status) where.gatewayStatus = status;
    if (tenantId) where.tenantId = tenantId;
    if (from || to) {
      where.initiatedAt = {};
      if (from) where.initiatedAt.gte = new Date(from);
      if (to) where.initiatedAt.lte = new Date(to + 'T23:59:59Z');
    }

    const [data, total] = await Promise.all([
      prisma.paymentGatewayTransaction.findMany({
        where,
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
          invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } },
        },
        orderBy: { initiatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.paymentGatewayTransaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Get a single transaction by ID */
  async findById(id: string, companyId: string) {
    const txn = await prisma.paymentGatewayTransaction.findFirst({
      where: { id, companyId },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true } },
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, status: true, currency: true } },
        property: { select: { id: true, name: true } },
      },
    });
    if (!txn) throw AppError.notFound('Payment transaction');
    return txn;
  }

  /** Aggregate summary for dashboard */
  async getSummary(companyId: string) {
    const [totals] = await prisma.$queryRaw<Array<{
      total: string; completed: string; failed: string; pending: string; refunded: string;
      completed_amount: string; fee_amount: string;
    }>>`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE gateway_status = 'completed')::text AS completed,
        COUNT(*) FILTER (WHERE gateway_status = 'failed')::text AS failed,
        COUNT(*) FILTER (WHERE gateway_status = 'initiated')::text AS pending,
        COUNT(*) FILTER (WHERE gateway_status = 'refunded')::text AS refunded,
        COALESCE(SUM(amount) FILTER (WHERE gateway_status = 'completed'), 0)::text AS completed_amount,
        COALESCE(SUM(fee_amount) FILTER (WHERE gateway_status = 'completed'), 0)::text AS fee_amount
      FROM payment_gateway_transactions
      WHERE company_id = ${companyId}::uuid
    `;

    const totalCompleted = Number(totals.completed_amount);
    const totalFees = Number(totals.fee_amount);

    return {
      totalTransactions: Number(totals.total),
      completedCount: Number(totals.completed),
      failedCount: Number(totals.failed),
      pendingCount: Number(totals.pending),
      refundedCount: Number(totals.refunded),
      totalCompleted,
      totalFees,
      totalNet: totalCompleted - totalFees,
    };
  }

  // ══════════════════════════════════════════════
  // STRIPE CHECKOUT SESSION
  // ══════════════════════════════════════════════

  /**
   * Initiate a payment. If Stripe is configured, creates a real
   * Checkout Session. Otherwise returns a mock URL for development.
   */
  async initiate(companyId: string, data: {
    gateway: string; invoiceId: string; tenantId: string;
    amount: number; currency: string; payerEmail?: string;
    payerName?: string; propertyId?: string; returnUrl: string;
  }) {
    // Verify the invoice exists and is payable
    const invoice = await prisma.invoice.findFirst({
      where: { id: data.invoiceId, companyId },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
        lines: { include: { chargeType: { select: { name: true } } } },
      },
    });
    if (!invoice) throw AppError.notFound('Invoice');

    const outstanding = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (outstanding <= 0) throw AppError.validation('Invoice is already fully paid');

    const payAmount = Math.min(data.amount, outstanding);

    // ── Stripe Checkout ─────────────────────────
    if (data.gateway === 'stripe' && isStripeConfigured()) {
      return this._initiateStripe(companyId, invoice, payAmount, data);
    }

    // ── Mock / other gateways ───────────────────
    return this._initiateMock(companyId, invoice, payAmount, data);
  }

  /** Real Stripe Checkout Session */
  private async _initiateStripe(
    companyId: string,
    invoice: any,
    amount: number,
    data: { gateway: string; tenantId: string; currency: string; payerEmail?: string; payerName?: string; propertyId?: string; returnUrl: string },
  ) {
    const stripe = getStripe();

    // Build line items from invoice lines
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = invoice.lines.map((line: any) => ({
      price_data: {
        currency: data.currency.toLowerCase(),
        product_data: {
          name: line.chargeType?.name || line.description || `Invoice ${invoice.invoiceNumber}`,
          description: line.description || undefined,
        },
        unit_amount: Math.round(Number(line.amount) * 100), // Stripe expects cents
      },
      quantity: 1,
    }));

    // If invoice lines don't cover full amount (taxes, adjustments), add a catch-all
    const lineTotal = invoice.lines.reduce((s: number, l: any) => s + Number(l.amount), 0);
    if (Math.abs(amount - lineTotal) > 0.01) {
      lineItems.length = 0; // Clear and use a single line
      lineItems.push({
        price_data: {
          currency: data.currency.toLowerCase(),
          product_data: {
            name: `Invoice ${invoice.invoiceNumber}`,
            description: `Payment for invoice ${invoice.invoiceNumber}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      });
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: data.payerEmail || invoice.tenant?.email || undefined,
      success_url: `${data.returnUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${data.returnUrl}?status=cancelled`,
      metadata: {
        invoiceId: invoice.id,
        tenantId: data.tenantId,
        companyId,
        internalTxnId: '', // will update after record creation
      },
      payment_intent_data: {
        description: `Invoice ${invoice.invoiceNumber}`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        },
      },
    });

    // Save the transaction record
    const txn = await prisma.paymentGatewayTransaction.create({
      data: {
        companyId,
        propertyId: data.propertyId || invoice.propertyId || null,
        gateway: 'stripe',
        gatewayTxnId: session.id,
        gatewayStatus: 'initiated',
        amount,
        currency: data.currency,
        payerEmail: data.payerEmail || invoice.tenant?.email || null,
        payerName: data.payerName || null,
        tenantId: data.tenantId,
        invoiceId: invoice.id,
        paymentMethod: 'card',
        metadata: {
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
          returnUrl: data.returnUrl,
        } as any,
      },
    });

    logger.info(`Stripe checkout session created: ${session.id} for ${amount} ${data.currency} [txn: ${txn.id}]`);

    return {
      transactionId: txn.id,
      gatewayTxnId: session.id,
      checkoutUrl: session.url!,
      sessionId: session.id,
    };
  }

  /** Mock checkout for development / non-Stripe gateways */
  private async _initiateMock(
    companyId: string,
    invoice: any,
    amount: number,
    data: { gateway: string; tenantId: string; currency: string; payerEmail?: string; payerName?: string; propertyId?: string; returnUrl: string },
  ) {
    const gatewayTxnId = `${data.gateway}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const txn = await prisma.paymentGatewayTransaction.create({
      data: {
        companyId,
        propertyId: data.propertyId || invoice.propertyId || null,
        gateway: data.gateway,
        gatewayTxnId,
        gatewayStatus: 'initiated',
        amount,
        currency: data.currency,
        payerEmail: data.payerEmail || null,
        payerName: data.payerName || null,
        tenantId: data.tenantId,
        invoiceId: invoice.id,
        paymentMethod: data.gateway === 'stripe' ? 'card' : null,
        metadata: { returnUrl: data.returnUrl },
      },
    });

    const checkoutUrl = data.gateway === 'stripe'
      ? `https://checkout.stripe.com/pay/${gatewayTxnId}`
      : data.gateway === 'paypal'
      ? `https://paypal.com/checkout/${gatewayTxnId}`
      : `https://pay.paytabs.com/${gatewayTxnId}`;

    logger.info(`Mock payment initiated: ${txn.id} via ${data.gateway} for ${amount} ${data.currency}`);

    return {
      transactionId: txn.id,
      gatewayTxnId,
      checkoutUrl,
      sessionId: gatewayTxnId,
    };
  }

  // ══════════════════════════════════════════════
  // STRIPE WEBHOOK HANDLER
  // ══════════════════════════════════════════════

  /**
   * Processes incoming Stripe webhook events.
   * Call this from the webhook route with the raw body and signature header.
   */
  async handleStripeWebhook(rawBody: Buffer | string, signature: string): Promise<{ received: boolean; event?: string }> {
    const stripe = getStripe();

    if (!config.stripe.webhookSecret) {
      throw AppError.validation('Stripe webhook secret is not configured');
    }

    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripe.webhookSecret,
      );
    } catch (err: any) {
      logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      throw AppError.validation(`Webhook signature verification failed: ${err.message}`);
    }

    logger.info(`Stripe webhook received: ${event.type} [${event.id}]`);

    switch (event.type) {
      // ── Payment success ──────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this._handleCheckoutCompleted(session);
        break;
      }

      // ── Payment failed ───────────────────────
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this._handleCheckoutExpired(session);
        break;
      }

      // ── Payment intent failed ────────────────
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this._handlePaymentFailed(pi);
        break;
      }

      // ── Charge refunded ──────────────────────
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await this._handleChargeRefunded(charge);
        break;
      }

      default:
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true, event: event.type };
  }

  /** checkout.session.completed — auto-create receipt and update invoice */
  private async _handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const txn = await prisma.paymentGatewayTransaction.findUnique({
      where: { gatewayTxnId: session.id },
    });
    if (!txn) {
      logger.warn(`No matching transaction for Stripe session: ${session.id}`);
      return;
    }
    if (txn.gatewayStatus !== 'initiated') {
      logger.info(`Transaction ${txn.id} already processed (status: ${txn.gatewayStatus})`);
      return;
    }

    // Retrieve fee details from the payment intent → charge
    let feeAmount = 0;
    let paymentMethodType: string | null = 'card';
    let payerEmail = session.customer_email || txn.payerEmail;
    let payerName = session.customer_details?.name || txn.payerName;

    if (session.payment_intent && typeof session.payment_intent === 'string') {
      try {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
          expand: ['latest_charge'],
        });
        const charge = pi.latest_charge as Stripe.Charge | null;
        if (charge?.balance_transaction && typeof charge.balance_transaction === 'string') {
          const bt = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
          feeAmount = bt.fee / 100; // convert from cents
        }
        paymentMethodType = charge?.payment_method_details?.type || 'card';
      } catch (err: any) {
        logger.warn(`Could not retrieve Stripe fee details: ${err.message}`);
      }
    }

    // Transactionally update everything
    await prisma.$transaction(async (tx) => {
      // 1. Mark gateway txn as completed
      await tx.paymentGatewayTransaction.update({
        where: { id: txn.id },
        data: {
          gatewayStatus: 'completed',
          completedAt: new Date(),
          paymentMethod: paymentMethodType,
          feeAmount,
          netAmount: Number(txn.amount) - feeAmount,
          payerEmail,
          payerName,
          metadata: {
            ...(txn.metadata as any || {}),
            paymentIntentId: session.payment_intent,
            stripeCustomerEmail: session.customer_email,
          },
        },
      });

      // 2. Update invoice paid amount
      if (txn.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: txn.invoiceId } });
        if (invoice) {
          const newPaid = Number(invoice.paidAmount) + Number(txn.amount);
          const newStatus = newPaid >= Number(invoice.totalAmount) ? 'paid' : 'partially_paid';
          await tx.invoice.update({
            where: { id: txn.invoiceId },
            data: { paidAmount: newPaid, status: newStatus },
          });
        }
      }

      logger.info(`Stripe payment completed: txn=${txn.id}, amount=${txn.amount}, fee=${feeAmount}`);
    });
  }

  /** checkout.session.expired — mark as failed */
  private async _handleCheckoutExpired(session: Stripe.Checkout.Session) {
    const txn = await prisma.paymentGatewayTransaction.findUnique({
      where: { gatewayTxnId: session.id },
    });
    if (!txn || txn.gatewayStatus !== 'initiated') return;

    await prisma.paymentGatewayTransaction.update({
      where: { id: txn.id },
      data: {
        gatewayStatus: 'failed',
        failedAt: new Date(),
        failureReason: 'Checkout session expired — customer did not complete payment',
      },
    });

    logger.info(`Stripe checkout expired: txn=${txn.id}`);
  }

  /** payment_intent.payment_failed — mark as failed */
  private async _handlePaymentFailed(pi: Stripe.PaymentIntent) {
    // Find by stored payment intent ID in metadata
    const txns = await prisma.paymentGatewayTransaction.findMany({
      where: {
        gateway: 'stripe',
        gatewayStatus: 'initiated',
      },
    });

    // Match by payment intent ID stored in metadata
    const txn = txns.find((t) => {
      const meta = t.metadata as any;
      return meta?.paymentIntentId === pi.id;
    });

    if (!txn) return;

    const reason = pi.last_payment_error?.message || 'Payment failed';
    await prisma.paymentGatewayTransaction.update({
      where: { id: txn.id },
      data: {
        gatewayStatus: 'failed',
        failedAt: new Date(),
        failureReason: reason,
      },
    });

    logger.info(`Stripe payment failed: txn=${txn.id} — ${reason}`);
  }

  /** charge.refunded — mark as refunded and reverse invoice */
  private async _handleChargeRefunded(charge: Stripe.Charge) {
    // Try to find by payment intent → session
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!piId) return;

    const txns = await prisma.paymentGatewayTransaction.findMany({
      where: { gateway: 'stripe', gatewayStatus: 'completed' },
    });

    const txn = txns.find((t) => {
      const meta = t.metadata as any;
      return meta?.paymentIntentId === piId;
    });

    if (!txn) return;

    await prisma.$transaction(async (tx) => {
      await tx.paymentGatewayTransaction.update({
        where: { id: txn.id },
        data: {
          gatewayStatus: 'refunded',
          metadata: {
            ...(txn.metadata as any || {}),
            refundedAt: new Date().toISOString(),
            stripeRefundId: charge.id,
          },
        },
      });

      if (txn.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: txn.invoiceId } });
        if (invoice) {
          const newPaid = Math.max(0, Number(invoice.paidAmount) - Number(txn.amount));
          const newStatus = newPaid <= 0 ? 'sent' : 'partially_paid';
          await tx.invoice.update({
            where: { id: txn.invoiceId },
            data: { paidAmount: newPaid, status: newStatus },
          });
        }
      }

      logger.info(`Stripe refund processed: txn=${txn.id}`);
    });
  }

  // ══════════════════════════════════════════════
  // MANUAL CONFIRM / FAIL / REFUND
  // ══════════════════════════════════════════════

  /** Manually confirm a payment (for non-Stripe or testing) */
  async confirm(gatewayTxnId: string, details: {
    paymentMethod?: string; feeAmount?: number; netAmount?: number;
    payerEmail?: string; payerName?: string; metadata?: any;
  } = {}) {
    const txn = await prisma.paymentGatewayTransaction.findUnique({
      where: { gatewayTxnId },
    });
    if (!txn) throw AppError.notFound('Payment transaction');
    if (txn.gatewayStatus !== 'initiated') throw AppError.validation('Transaction is not in initiated state');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.paymentGatewayTransaction.update({
        where: { id: txn.id },
        data: {
          gatewayStatus: 'completed',
          completedAt: new Date(),
          paymentMethod: details.paymentMethod || txn.paymentMethod,
          feeAmount: details.feeAmount || 0,
          netAmount: details.netAmount || Number(txn.amount) - (details.feeAmount || 0),
          payerEmail: details.payerEmail || txn.payerEmail,
          payerName: details.payerName || txn.payerName,
          metadata: details.metadata || txn.metadata,
        },
      });

      if (txn.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: txn.invoiceId } });
        if (invoice) {
          const newPaid = Number(invoice.paidAmount) + Number(txn.amount);
          const newStatus = newPaid >= Number(invoice.totalAmount) ? 'paid' : 'partially_paid';
          await tx.invoice.update({
            where: { id: txn.invoiceId },
            data: { paidAmount: newPaid, status: newStatus },
          });
        }
      }

      logger.info(`Payment manually confirmed: ${txn.id} (${gatewayTxnId})`);
      return updated;
    });
  }

  /** Mark payment as failed (for non-Stripe or testing) */
  async fail(gatewayTxnId: string, failureReason: string) {
    const txn = await prisma.paymentGatewayTransaction.findUnique({
      where: { gatewayTxnId },
    });
    if (!txn) throw AppError.notFound('Payment transaction');

    const updated = await prisma.paymentGatewayTransaction.update({
      where: { id: txn.id },
      data: {
        gatewayStatus: 'failed',
        failedAt: new Date(),
        failureReason,
      },
    });

    logger.info(`Payment failed: ${txn.id} — ${failureReason}`);
    return updated;
  }

  /**
   * Admin-initiated refund.
   * If Stripe is configured and the txn is a Stripe payment,
   * creates a real Stripe refund. Otherwise just updates the DB.
   */
  async refund(id: string, companyId: string, reason: string) {
    const txn = await prisma.paymentGatewayTransaction.findFirst({
      where: { id, companyId, gatewayStatus: 'completed' },
    });
    if (!txn) throw AppError.notFound('Completed payment transaction');

    // ── Try real Stripe refund ──────────────────
    if (txn.gateway === 'stripe' && isStripeConfigured()) {
      const meta = txn.metadata as any;
      const paymentIntentId = meta?.paymentIntentId;

      if (paymentIntentId) {
        try {
          const stripe = getStripe();
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
            metadata: { internalReason: reason, txnId: txn.id },
          });
          logger.info(`Stripe refund initiated for PI: ${paymentIntentId}`);
          // The charge.refunded webhook will handle the DB update
          // But we still update here in case webhook is delayed
        } catch (err: any) {
          logger.error(`Stripe refund failed: ${err.message}`);
          throw AppError.validation(`Stripe refund failed: ${err.message}`);
        }
      }
    }

    // ── Update DB ───────────────────────────────
    return prisma.$transaction(async (tx) => {
      const updated = await tx.paymentGatewayTransaction.update({
        where: { id },
        data: {
          gatewayStatus: 'refunded',
          metadata: {
            ...(txn.metadata as any || {}),
            refundReason: reason,
            refundedAt: new Date().toISOString(),
          },
        },
      });

      if (txn.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: txn.invoiceId } });
        if (invoice) {
          const newPaid = Math.max(0, Number(invoice.paidAmount) - Number(txn.amount));
          const newStatus = newPaid <= 0 ? 'sent' : 'partially_paid';
          await tx.invoice.update({
            where: { id: txn.invoiceId },
            data: { paidAmount: newPaid, status: newStatus },
          });
        }
      }

      logger.info(`Payment refunded: ${txn.id} — ${reason}`);
      return updated;
    });
  }
}

export const paymentGatewayService = new PaymentGatewayService();
