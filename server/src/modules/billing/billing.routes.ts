import { Router, Request } from 'express';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { chargeTypesService } from './chargeTypes.service';
import { meterSetupService } from './meterSetup.service';
import { billingSchedulesService } from './billingSchedules.service';
import { invoicesService } from './invoices.service';
import { penaltyService } from './penalty.service';
import { taxService } from './tax.service';
import { invoicePdfService } from './pdf.service';
import { notificationService } from '../notifications/services/notification.service';
import {
  createChargeTypeSchema, updateChargeTypeSchema, createBillingScheduleSchema, updateBillingScheduleSchema,
  createInvoiceSchema, voidInvoiceSchema, createCreditNoteSchema,
  createPenaltyConfigSchema, createTaxConfigSchema,
  createMeterSetupSchema, updateMeterSetupSchema,
} from './billing.schema';

const p = (req: Request, key: string) => req.params[key] as string;

// ════════════════════════════════════════════════
// CHARGE TYPES — /api/v1/billing/charge-types
// ════════════════════════════════════════════════
export const chargeTypesRouter = Router();

chargeTypesRouter.get('/', asyncHandler(async (req, res) => {
  const data = await chargeTypesService.findAll(req.user!.companyId);
  res.json({ success: true, data });
}));

chargeTypesRouter.post('/', validateRequest(createChargeTypeSchema), asyncHandler(async (req, res) => {
  const data = await chargeTypesService.create(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

chargeTypesRouter.put('/:id', validateRequest(updateChargeTypeSchema), asyncHandler(async (req, res) => {
  const data = await chargeTypesService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// METER SETUP — /api/v1/billing/meter-setup
// ════════════════════════════════════════════════
export const meterSetupRouter = Router();

meterSetupRouter.get('/', asyncHandler(async (req, res) => {
  const data = await meterSetupService.findAll(req.user!.companyId, {
    propertyId: req.query.propertyId as string,
  });
  res.json({ success: true, data });
}));

meterSetupRouter.post('/', validateRequest(createMeterSetupSchema), asyncHandler(async (req, res) => {
  const data = await meterSetupService.create(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

meterSetupRouter.put('/:id', validateRequest(updateMeterSetupSchema), asyncHandler(async (req, res) => {
  const data = await meterSetupService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

meterSetupRouter.delete('/:id', asyncHandler(async (req, res) => {
  await meterSetupService.delete(p(req, 'id'), req.user!.companyId);
  res.json({ success: true });
}));

// ════════════════════════════════════════════════
// BILLING SCHEDULES — /api/v1/billing/schedules
// ════════════════════════════════════════════════
export const billingSchedulesRouter = Router();

billingSchedulesRouter.get('/', asyncHandler(async (req, res) => {
  const result = await billingSchedulesService.findAll(req.user!.companyId, {
    leaseId: req.query.leaseId as string,
    tenantId: req.query.tenantId as string,
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

billingSchedulesRouter.post('/', validateRequest(createBillingScheduleSchema), asyncHandler(async (req, res) => {
  const data = await billingSchedulesService.create(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

billingSchedulesRouter.put('/:id', validateRequest(updateBillingScheduleSchema), asyncHandler(async (req, res) => {
  const data = await billingSchedulesService.update(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

billingSchedulesRouter.post('/:id/pause', asyncHandler(async (req, res) => {
  const data = await billingSchedulesService.pause(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

billingSchedulesRouter.post('/:id/resume', asyncHandler(async (req, res) => {
  const data = await billingSchedulesService.resume(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

billingSchedulesRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  const data = await billingSchedulesService.cancel(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// INVOICES — /api/v1/invoices
// ════════════════════════════════════════════════
export const invoicesRouter = Router();

invoicesRouter.get('/', asyncHandler(async (req, res) => {
  const result = await invoicesService.findAll(req.user!.companyId, {
    tenantId: req.query.tenantId as string,
    leaseId: req.query.leaseId as string,
    propertyId: req.query.propertyId as string,
    status: req.query.status as string,
    from: req.query.from as string,
    to: req.query.to as string,
    page: parseInt(req.query.page as string) || 1,
    limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
  });
  res.json({ success: true, ...result });
}));

invoicesRouter.get('/:id', asyncHandler(async (req, res) => {
  const data = await invoicesService.findById(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

invoicesRouter.post('/', validateRequest(createInvoiceSchema), asyncHandler(async (req, res) => {
  const data = await invoicesService.createManual(req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

invoicesRouter.post('/:id/void', validateRequest(voidInvoiceSchema), asyncHandler(async (req, res) => {
  const data = await invoicesService.void(p(req, 'id'), req.user!.companyId, req.body.reason, req.user!.sub);
  res.json({ success: true, data });
}));

invoicesRouter.post('/:id/credit-note', validateRequest(createCreditNoteSchema), asyncHandler(async (req, res) => {
  const data = await invoicesService.createCreditNote(p(req, 'id'), req.user!.companyId, req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
}));

invoicesRouter.get('/:id/pdf', asyncHandler(async (req, res) => {
  const result = await invoicePdfService.getPdfUrl(p(req, 'id'));
  res.json({ success: true, data: result });
}));

invoicesRouter.post('/:id/send', asyncHandler(async (req, res) => {
  const invoice = await invoicesService.findById(p(req, 'id'), req.user!.companyId);

  // Generate PDF if not yet generated
  let pdfUrl = (invoice as any).pdfUrl;
  if (!pdfUrl) {
    pdfUrl = await invoicePdfService.generatePdf(invoice.id);
  }

  // Get tenant email
  const tenantEmail = (invoice as any).tenant?.email;
  if (!tenantEmail) {
    throw new Error('Tenant has no email address configured');
  }

  // Send notification
  const tenantName = (invoice as any).tenant.tenantType === 'company'
    ? (invoice as any).tenant.companyName || ''
    : `${(invoice as any).tenant.firstName || ''} ${(invoice as any).tenant.lastName || ''}`.trim();

  await notificationService.send({
    templateCode: 'invoice_sent',
    companyId: req.user!.companyId,
    recipientIds: [req.user!.sub],
    channels: ['in_app'],
    variables: {
      invoiceNumber: invoice.invoiceNumber,
      tenantName,
      tenantEmail,
    },
    entityType: 'invoice',
    entityId: invoice.id,
  });

  // Update invoice status to 'sent'
  const updated = await (await import('../../common/database')).prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: invoice.status === 'draft' || invoice.status === 'issued' ? 'sent' : invoice.status, sentAt: new Date() },
  });

  res.json({ success: true, data: { invoiceId: invoice.id, status: updated.status, sentTo: tenantEmail, pdfUrl } });
}));

// ════════════════════════════════════════════════
// MANUAL BILLING RUN — /api/v1/billing/run
// ════════════════════════════════════════════════
export const billingRunRouter = Router();

billingRunRouter.post('/', asyncHandler(async (req, res) => {
  const asOfDate = req.body.asOfDate ? new Date(req.body.asOfDate) : new Date();
  const propertyId = req.body.propertyId as string | undefined;

  const dueSchedules = await billingSchedulesService.findDueSchedules(asOfDate, propertyId);
  let generated = 0;
  const errors: string[] = [];

  for (const schedule of dueSchedules) {
    try {
      await invoicesService.generateFromSchedule(schedule.id);
      generated++;
    } catch (err: any) {
      errors.push(`Schedule ${schedule.id}: ${err.message}`);
    }
  }

  res.json({ success: true, data: { processed: dueSchedules.length, generated, errors, asOfDate: asOfDate.toISOString().split('T')[0] } });
}));

// ════════════════════════════════════════════════
// PENALTY CONFIGS — /api/v1/billing/penalty-configs
// ════════════════════════════════════════════════
export const penaltyConfigsRouter = Router();

penaltyConfigsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await penaltyService.findConfigs(req.user!.companyId);
  res.json({ success: true, data });
}));

penaltyConfigsRouter.post('/', validateRequest(createPenaltyConfigSchema), asyncHandler(async (req, res) => {
  const data = await penaltyService.createConfig(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

// ════════════════════════════════════════════════
// TAX CONFIGS — /api/v1/billing/tax-configs
// ════════════════════════════════════════════════
export const taxConfigsRouter = Router();

taxConfigsRouter.get('/', asyncHandler(async (req, res) => {
  const data = await taxService.findAll(req.user!.companyId);
  res.json({ success: true, data });
}));

taxConfigsRouter.post('/', validateRequest(createTaxConfigSchema), asyncHandler(async (req, res) => {
  const data = await taxService.create(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));
