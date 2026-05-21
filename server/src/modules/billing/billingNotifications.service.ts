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

  for (const t of templates) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { code: t.code, companyId: null },
    });
    if (!existing) {
      await prisma.notificationTemplate.create({ data: t as any });
      logger.info(`Seeded notification template: ${t.code}`);
    }
  }
}

/**
 * Helper to send billing notifications. Silently logs errors without throwing.
 */
export class BillingNotifications {
  async invoiceIssued(invoice: {
    id: string; invoiceNumber: string; totalAmount: any; currency: string;
    dueDate: any; periodFrom: any; periodTo: any;
    companyId: string; tenantId: string;
  }, tenantName: string) {
    try {
      await notificationService.send({
        templateCode: 'invoice_issued',
        companyId: invoice.companyId,
        recipientIds: [invoice.tenantId],
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
      const outstandingAmount = Number(invoice.totalAmount) + penaltyAmount;
      await notificationService.send({
        templateCode: 'invoice_overdue_penalty',
        companyId: invoice.companyId,
        recipientIds: [invoice.tenantId],
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
      await notificationService.send({
        templateCode: 'credit_note_issued',
        companyId: creditNote.companyId,
        recipientIds: [creditNote.tenantId],
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
