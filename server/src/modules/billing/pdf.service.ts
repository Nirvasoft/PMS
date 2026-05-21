import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import path from 'path';
import fs from 'fs/promises';

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'invoices');

// Register Handlebars helpers
Handlebars.registerHelper('currency', (amount: any, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(amount)),
);
Handlebars.registerHelper('date', (dateStr: any) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
});
Handlebars.registerHelper('pct', (rate: any) => `${(Number(rate) * 100).toFixed(1)}%`);

const INVOICE_HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px; color: #1a1a2e; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 3px solid #6366f1; padding-bottom: 20px; }
    .company-name { font-size: 22px; font-weight: 700; color: #1a1a2e; }
    .invoice-title { font-size: 28px; font-weight: 700; color: #6366f1; text-align: right; }
    .invoice-number { font-size: 14px; color: #64748b; text-align: right; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px; }
    .meta-box { background: #f8fafc; border-radius: 8px; padding: 16px; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 6px; }
    .meta-value { font-size: 13px; font-weight: 500; }
    .status-badge { display: inline-block; padding: 3px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .status-issued { background: #dbeafe; color: #2563eb; }
    .status-paid { background: #dcfce7; color: #16a34a; }
    .status-overdue { background: #fee2e2; color: #dc2626; }
    .status-void { background: #f1f5f9; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #6366f1; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:first-child { border-radius: 6px 0 0 0; }
    thead th:last-child { border-radius: 0 6px 0 0; }
    tbody td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    .text-right { text-align: right; }
    .totals { margin-left: auto; width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
    .total-row.main { border-top: 2px solid #1a1a2e; font-size: 16px; font-weight: 700; padding: 12px 0; margin-top: 4px; }
    .total-row .label { color: #64748b; }
    .total-row .amount { font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 10px; }
    .notes { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 6px 6px 0; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">{{company.name}}</div>
      <div style="color:#64748b; margin-top:4px">{{property.name}}</div>
    </div>
    <div>
      <div class="invoice-title">{{#if isCreditNote}}CREDIT NOTE{{else}}INVOICE{{/if}}</div>
      <div class="invoice-number">{{invoiceNumber}}</div>
      <div style="margin-top:8px"><span class="status-badge status-{{status}}">{{status}}</span></div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <div class="meta-label">Bill To</div>
      <div class="meta-value">{{tenantName}}</div>
      {{#if tenant.email}}<div style="color:#64748b; margin-top:2px">{{tenant.email}}</div>{{/if}}
      {{#if unit}}<div style="margin-top:4px; color:#64748b">Unit {{unit.unitNumber}}</div>{{/if}}
    </div>
    <div class="meta-box">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div><div class="meta-label">Invoice Date</div><div class="meta-value">{{date invoiceDate}}</div></div>
        <div><div class="meta-label">Due Date</div><div class="meta-value">{{date dueDate}}</div></div>
        {{#if periodFrom}}<div><div class="meta-label">Period From</div><div class="meta-value">{{date periodFrom}}</div></div>{{/if}}
        {{#if periodTo}}<div><div class="meta-label">Period To</div><div class="meta-value">{{date periodTo}}</div></div>{{/if}}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Charge Type</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Tax</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td>{{this.description}}</td>
        <td style="color:#64748b">{{this.chargeType.name}}</td>
        <td class="text-right">{{this.quantity}}</td>
        <td class="text-right">{{currency this.unitPrice ../currency}}</td>
        <td class="text-right" style="color:#94a3b8">{{pct this.taxRate}}</td>
        <td class="text-right" style="font-weight:600">{{currency this.lineTotal ../currency}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span class="label">Subtotal</span><span class="amount">{{currency subtotal currency}}</span></div>
    {{#if taxAmount}}<div class="total-row"><span class="label">Tax</span><span class="amount">{{currency taxAmount currency}}</span></div>{{/if}}
    {{#if penaltyAmount}}<div class="total-row"><span class="label" style="color:#dc2626">Late Penalty</span><span class="amount" style="color:#dc2626">{{currency penaltyAmount currency}}</span></div>{{/if}}
    <div class="total-row main"><span class="label">Total</span><span class="amount">{{currency totalAmount currency}}</span></div>
    <div class="total-row"><span class="label">Paid</span><span class="amount" style="color:#16a34a">{{currency paidAmount currency}}</span></div>
    <div class="total-row" style="font-weight:600"><span class="label">Outstanding</span><span class="amount" style="color:{{#if outstandingPositive}}#dc2626{{else}}#16a34a{{/if}}">{{currency outstandingAmount currency}}</span></div>
  </div>

  {{#if notes}}
  <div class="notes">
    <div class="meta-label">Notes</div>
    <div>{{notes}}</div>
  </div>
  {{/if}}

  <div class="footer">
    Generated on {{date generatedAt}} • {{company.name}}
  </div>
</body>
</html>
`;

export class InvoicePdfService {
  private compiledTemplate = Handlebars.compile(INVOICE_HTML_TEMPLATE);

  async generatePdf(invoiceId: string): Promise<string> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: {
          include: { chargeType: { select: { code: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        tenant: { select: { id: true, firstName: true, lastName: true, companyName: true, tenantType: true, email: true } },
        unit: { select: { id: true, unitNumber: true } },
        property: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
      },
    });
    if (!invoice) throw AppError.notFound('Invoice');

    const tenantName = invoice.tenant.tenantType === 'company'
      ? invoice.tenant.companyName || ''
      : `${invoice.tenant.firstName || ''} ${invoice.tenant.lastName || ''}`.trim();

    const outstandingAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount);

    const html = this.compiledTemplate({
      ...invoice,
      tenantName,
      outstandingAmount,
      outstandingPositive: outstandingAmount > 0,
      isCreditNote: invoice.invoiceType === 'credit_note',
      generatedAt: new Date().toISOString(),
    });

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      });

      // Store PDF locally
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      const fileName = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
      const filePath = path.join(STORAGE_DIR, fileName);
      await fs.writeFile(filePath, pdfBuffer);

      // Update invoice with PDF path
      const pdfUrl = `/storage/invoices/${fileName}`;
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { pdfUrl },
      });

      logger.info(`PDF generated for invoice ${invoice.invoiceNumber}: ${pdfUrl}`);
      return pdfUrl;
    } finally {
      await browser.close();
    }
  }

  async getPdfUrl(invoiceId: string): Promise<{ url: string }> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { pdfUrl: true, invoiceNumber: true },
    });
    if (!invoice) throw AppError.notFound('Invoice');

    if (!invoice.pdfUrl) {
      // Generate on-demand if not yet generated
      const url = await this.generatePdf(invoiceId);
      return { url };
    }

    return { url: invoice.pdfUrl };
  }
}

export const invoicePdfService = new InvoicePdfService();
