import { prisma } from '../../common/database';
import { notificationService } from '../notifications/services/notification.service';
import { logger } from '../../common/logger';

/**
 * Seeds billing-related notification templates if they don't exist.
 */
export async function seedBillingNotificationTemplates() {
  const templates = [
    {
      code: 'invoice_issued',
      name: 'Invoice Issued',
      description: 'Sent when a new invoice is generated for a tenant',
      channels: ['email', 'in_app'],
      subject: 'Invoice {{invoiceNumber}} — {{currency}} {{totalAmount}} Due',
      bodyText: 'Dear {{tenantName}}, a new invoice {{invoiceNumber}} for {{currency}} {{totalAmount}} has been issued. Due date: {{dueDate}}. Period: {{periodFrom}} to {{periodTo}}.',
      bodyHtml: null,
      bodyPush: 'Invoice {{invoiceNumber}} for {{currency}} {{totalAmount}} is due on {{dueDate}}',
      isCritical: false,
    },
    {
      code: 'invoice_sent',
      name: 'Invoice Sent',
      description: 'Confirmation that invoice has been emailed to tenant',
      channels: ['in_app'],
      subject: 'Invoice {{invoiceNumber}} sent to {{tenantName}}',
      bodyText: 'Invoice {{invoiceNumber}} has been sent to {{tenantName}} at {{tenantEmail}}.',
      bodyHtml: null,
      bodyPush: null,
      isCritical: false,
    },
    {
      code: 'invoice_overdue',
      name: 'Invoice Overdue',
      description: 'Sent when an invoice transitions to overdue status',
      channels: ['email', 'in_app'],
      subject: 'OVERDUE: Invoice {{invoiceNumber}} — {{currency}} {{outstandingAmount}}',
      bodyText: 'Dear {{tenantName}}, your invoice {{invoiceNumber}} for {{currency}} {{totalAmount}} is now {{daysOverdue}} days overdue. Outstanding amount: {{currency}} {{outstandingAmount}}. Please arrange payment immediately.',
      bodyHtml: null,
      bodyPush: 'Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue',
      isCritical: true,
    },
    {
      code: 'invoice_overdue_penalty',
      name: 'Late Payment Penalty Applied',
      description: 'Sent when a late payment penalty is applied to an overdue invoice',
      channels: ['email', 'in_app'],
      subject: 'Late Payment Penalty — Invoice {{invoiceNumber}}',
      bodyText: 'Dear {{tenantName}}, a late payment penalty of {{currency}} {{penaltyAmount}} has been applied to invoice {{invoiceNumber}} ({{daysOverdue}} days overdue). New total: {{currency}} {{totalAmount}}.',
      bodyHtml: null,
      bodyPush: 'Penalty of {{currency}} {{penaltyAmount}} applied to invoice {{invoiceNumber}}',
      isCritical: true,
    },
    {
      code: 'invoice_voided',
      name: 'Invoice Voided',
      description: 'Sent when an invoice is voided',
      channels: ['in_app'],
      subject: 'Invoice {{invoiceNumber}} Voided',
      bodyText: 'Invoice {{invoiceNumber}} for {{currency}} {{totalAmount}} has been voided. Reason: {{voidReason}}.',
      bodyHtml: null,
      bodyPush: null,
      isCritical: false,
    },
    {
      code: 'credit_note_issued',
      name: 'Credit Note Issued',
      description: 'Sent when a credit note is created against an invoice',
      channels: ['email', 'in_app'],
      subject: 'Credit Note {{invoiceNumber}} — {{currency}} {{totalAmount}}',
      bodyText: 'Dear {{tenantName}}, a credit note {{invoiceNumber}} for {{currency}} {{totalAmount}} has been issued against invoice {{originalInvoiceNumber}}. Reason: {{creditReason}}.',
      bodyHtml: null,
      bodyPush: 'Credit note {{invoiceNumber}} issued for {{currency}} {{totalAmount}}',
      isCritical: false,
    },
  ];

  const existing = await prisma.notificationTemplate.findMany({
    where: { companyId: null, code: { in: templates.map((t) => t.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((t) => t.code));
  const missing = templates.filter((t) => !existingCodes.has(t.code));
  if (missing.length > 0) {
    await prisma.notificationTemplate.createMany({ data: missing as any, skipDuplicates: true });
    logger.info(`Seeded ${missing.length} billing notification templates`);
  }
}

/**
 * Helper to send billing notifications. Silently logs errors without throwing.
 */
export class BillingNotifications {
  private async resolveRecipientUserIds(companyId: string, tenantId: string): Promise<string[]> {
    if (!tenantId) return [];
    const userIds = new Set<string>();

    // 1. Check if recipientId is already a valid User ID
    const directUser = await prisma.user.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (directUser) {
      userIds.add(directUser.id);
    }

    // 2. Check active Resident records linked to this tenant that have a portal userId
    const residents = await prisma.resident.findMany({
      where: { companyId, tenantId, isActive: true, userId: { not: null } },
      select: { userId: true },
    });
    for (const r of residents) {
      if (r.userId) userIds.add(r.userId);
    }

    // 3. Check if the tenant's email matches a User in the same company
    if (userIds.size === 0) {
      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, companyId },
        select: { email: true },
      });
      if (tenant?.email) {
        const userByEmail = await prisma.user.findFirst({
          where: { companyId, email: { equals: tenant.email, mode: 'insensitive' } },
          select: { id: true },
        });
        if (userByEmail) userIds.add(userByEmail.id);
      }
    }

    return Array.from(userIds);
  }

  async invoiceIssued(invoice: {
    id: string; invoiceNumber: string; totalAmount: any; currency: string;
    dueDate: any; periodFrom: any; periodTo: any;
    companyId: string; tenantId: string;
  }, tenantName: string) {
    try {
      const recipientIds = await this.resolveRecipientUserIds(invoice.companyId, invoice.tenantId);
      if (recipientIds.length === 0) return;

      await notificationService.send({
        templateCode: 'invoice_issued',
        companyId: invoice.companyId,
        recipientIds,
        channels: ['email', 'in_app'],
        variables: {
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: Number(invoice.totalAmount).toFixed(2),
          currency: invoice.currency,
          dueDate: new Date(invoice.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          periodFrom: invoice.periodFrom ? new Date(invoice.periodFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
          periodTo: invoice.periodTo ? new Date(invoice.periodTo).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
          tenantName,
        },
        entityType: 'invoice',
        entityId: invoice.id,
      });
    } catch (err) {
      logger.error(`Failed to send invoice_issued notification for ${invoice.invoiceNumber}`, { err });
    }
  }

  async invoiceOverduePenalty(invoice: {
    id: string; invoiceNumber: string; totalAmount: any; currency: string;
    companyId: string; tenantId: string;
  }, penaltyAmount: number, daysOverdue: number, tenantName: string) {
    try {
      const recipientIds = await this.resolveRecipientUserIds(invoice.companyId, invoice.tenantId);
      if (recipientIds.length === 0) return;

      const outstandingAmount = Number(invoice.totalAmount) + penaltyAmount;
      await notificationService.send({
        templateCode: 'invoice_overdue_penalty',
        companyId: invoice.companyId,
        recipientIds,
        channels: ['email', 'in_app'],
        variables: {
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: outstandingAmount.toFixed(2),
          penaltyAmount: penaltyAmount.toFixed(2),
          currency: invoice.currency,
          daysOverdue,
          tenantName,
        },
        entityType: 'invoice',
        entityId: invoice.id,
      });
    } catch (err) {
      logger.error(`Failed to send penalty notification for ${invoice.invoiceNumber}`, { err });
    }
  }

  async creditNoteIssued(creditNote: {
    id: string; invoiceNumber: string; totalAmount: any; currency: string;
    companyId: string; tenantId: string; creditReason?: string | null;
  }, originalInvoiceNumber: string, tenantName: string) {
    try {
      const recipientIds = await this.resolveRecipientUserIds(creditNote.companyId, creditNote.tenantId);
      if (recipientIds.length === 0) return;

      await notificationService.send({
        templateCode: 'credit_note_issued',
        companyId: creditNote.companyId,
        recipientIds,
        channels: ['email', 'in_app'],
        variables: {
          invoiceNumber: creditNote.invoiceNumber,
          totalAmount: Number(creditNote.totalAmount).toFixed(2),
          currency: creditNote.currency,
          originalInvoiceNumber,
          creditReason: creditNote.creditReason || '',
          tenantName,
        },
        entityType: 'invoice',
        entityId: creditNote.id,
      });
    } catch (err) {
      logger.error(`Failed to send credit_note_issued notification for ${creditNote.invoiceNumber}`, { err });
    }
  }
}

export const billingNotifications = new BillingNotifications();
