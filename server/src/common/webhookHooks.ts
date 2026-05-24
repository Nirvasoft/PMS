/**
 * Domain Webhook Hooks — convenience wrappers for emitWebhookEvent().
 * Import these into domain services to fire webhook events after mutations.
 *
 * All methods are fire-and-forget (async but never throw to the caller).
 */
import { integrationsService } from '../modules/integrations/integrations.service';
import { logger } from './logger';

function emit(event: string, data: Record<string, unknown>, companyId: string) {
  integrationsService.emitWebhookEvent(event, data, companyId).catch(err => {
    logger.debug(`Webhook emit error for ${event}: ${err.message}`);
  });
}

// ── Lease Events ──
export const webhookLeaseCreated = (lease: any) =>
  emit('lease.created', { leaseId: lease.id, leaseNumber: lease.leaseNumber, status: lease.status, tenantId: lease.tenantId, unitId: lease.unitId }, lease.companyId);

export const webhookLeaseActivated = (lease: any) =>
  emit('lease.activated', { leaseId: lease.id, leaseNumber: lease.leaseNumber, tenantId: lease.tenantId, unitId: lease.unitId }, lease.companyId);

export const webhookLeaseTerminated = (result: any, companyId: string) =>
  emit('lease.terminated', { leaseId: result.leaseId, terminationType: result.terminationType, terminationDate: result.terminationDate, earlyTerminationPenalty: result.earlyTerminationPenalty }, companyId);

export const webhookLeaseRenewed = (renewal: any) =>
  emit('lease.renewed', { leaseId: renewal.id, leaseNumber: renewal.leaseNumber, parentLeaseId: renewal.parentLeaseId, startDate: renewal.startDate, endDate: renewal.endDate }, renewal.companyId);

export const webhookLeaseAmended = (leaseId: string, amendmentNumber: number, companyId: string) =>
  emit('lease.amended', { leaseId, amendmentNumber }, companyId);

// ── Invoice Events ──
export const webhookInvoiceIssued = (invoice: any) =>
  emit('invoice.issued', { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, totalAmount: Number(invoice.totalAmount), tenantId: invoice.tenantId, currency: invoice.currency }, invoice.companyId);

export const webhookInvoicePaid = (invoiceId: string, invoiceNumber: string, companyId: string) =>
  emit('invoice.paid', { invoiceId, invoiceNumber }, companyId);

export const webhookInvoiceOverdue = (count: number, companyId: string) => {
  if (count > 0) emit('invoice.overdue', { count, transitionedAt: new Date().toISOString() }, companyId);
};

// ── Payment Events ──
export const webhookPaymentReceived = (receipt: any) =>
  emit('payment.received', { receiptId: receipt.id, receiptNumber: receipt.receiptNumber, amount: Number(receipt.amount), tenantId: receipt.tenantId, paymentMethod: receipt.paymentMethod }, receipt.companyId);

export const webhookRefundProcessed = (receipt: any) =>
  emit('refund.processed', { receiptId: receipt.id, receiptNumber: receipt.receiptNumber, amount: Number(receipt.amount) }, receipt.companyId);

// ── Ticket Events ──
export const webhookTicketCreated = (ticket: any) =>
  emit('ticket.created', { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, priority: ticket.priority, propertyId: ticket.propertyId }, ticket.companyId);

export const webhookTicketAssigned = (ticketId: string, ticketNumber: string, technicianId: string, companyId: string) =>
  emit('ticket.assigned', { ticketId, ticketNumber, technicianId }, companyId);

export const webhookTicketCompleted = (ticketId: string, ticketNumber: string, companyId: string) =>
  emit('ticket.completed', { ticketId, ticketNumber }, companyId);

export const webhookTicketRated = (ticketId: string, rating: number, companyId: string) =>
  emit('ticket.rated', { ticketId, rating }, companyId);

export const webhookTicketSlaBreach = (ticketId: string, ticketNumber: string, breachType: string, companyId: string) =>
  emit('ticket.sla_breach', { ticketId, ticketNumber, breachType }, companyId);

// ── Tenant Events ──
export const webhookTenantCreated = (tenant: any) =>
  emit('tenant.created', { tenantId: tenant.id, tenantType: tenant.tenantType }, tenant.companyId);

export const webhookTenantKycVerified = (tenantId: string, companyId: string) =>
  emit('tenant.kyc_verified', { tenantId }, companyId);

export const webhookTenantBlacklisted = (tenantId: string, reason: string, companyId: string) =>
  emit('tenant.blacklisted', { tenantId, reason }, companyId);

// ── Unit Events ──
export const webhookUnitStatusChanged = (unitId: string, oldStatus: string, newStatus: string, companyId: string) =>
  emit('unit.status_changed', { unitId, oldStatus, newStatus }, companyId);
