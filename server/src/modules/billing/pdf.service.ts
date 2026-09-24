import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';

// ─── Handlebars Helpers ────────────────────────────────────────────────────────
Handlebars.registerHelper('mmk', (v: any) => {
  const n = Number(v);
  return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});
Handlebars.registerHelper('n2', (v: any) => {
  const n = Number(v);
  if (!n || isNaN(n)) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});
Handlebars.registerHelper('dmy', (d: any) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
});
Handlebars.registerHelper('monthYr', (d: any) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});

// ─── Myanmar-Style Invoice Template ───────────────────────────────────────────
const INVOICE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Noto Sans Myanmar', 'Pyidaungsu', 'Myanmar Text', 'Padauk', Arial, sans-serif;
      font-size: 12px;
      color: #000;
      padding: 28px 40px;
      background: #fff;
    }

    /* ── Page Header ─────────────────────────────── */
    .page-header {
      display: flex;
      align-items: center;
      margin-bottom: 18px;
      padding-bottom: 12px;
    }
    .logo-wrap {
      width: 95px;
      height: 95px;
      flex-shrink: 0;
      margin-right: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .title-block {
      flex: 1;
      text-align: center;
    }
    .title-floor {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 5px;
      letter-spacing: 0.3px;
    }
    .title-main {
      font-size: 15px;
      font-weight: 700;
    }

    /* ── Info Section ────────────────────────────── */
    .info-section {
      margin-bottom: 18px;
    }
    .info-row {
      display: flex;
      align-items: baseline;
      margin-bottom: 5px;
    }
    .info-label {
      width: 230px;
      flex-shrink: 0;
      font-size: 12px;
    }
    .info-value {
      flex: 1;
      font-size: 12px;
      border-bottom: 1px dashed #555;
      padding-bottom: 1px;
      min-height: 16px;
    }

    /* ── Items Table ─────────────────────────────── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
      margin-bottom: 0;
    }
    .items-table th,
    .items-table td {
      border: 1px solid #222;
      padding: 5px 7px;
      vertical-align: middle;
    }
    .items-table thead th {
      font-weight: 700;
      text-align: center;
      background: #fff;
      font-size: 11.5px;
      line-height: 1.4;
    }

    /* Column widths */
    .col-no   { width: 36px;  text-align: center; }
    .col-img  { width: 36px;  text-align: center; }
    .col-desc { text-align: left; }
    .col-sqft { width: 88px;  text-align: center; }
    .col-rate { width: 82px;  text-align: right;  }
    .col-qty  { width: 72px;  text-align: right;  }
    .col-amt  { width: 105px; text-align: right;  }

    /* Row styles */
    .row-group td { font-weight: 700; }
    .row-sub   td { font-weight: 400; }
    .row-grand td { font-weight: 700; font-size: 12px; background: #fff; }

    /* Utility */
    .ta-right  { text-align: right  !important; }
    .ta-center { text-align: center !important; }
    .pl-14     { padding-left: 14px !important; }

    /* ── Footer ──────────────────────────────────── */
    .footer-wrap {
      margin-top: 18px;
      font-size: 11.5px;
    }
    .footer-note { margin-bottom: 6px; line-height: 1.6; }
    .footer-hours { margin-top: 10px; display: flex; align-items: baseline; gap: 12px; }
    .footer-hours .label { white-space: nowrap; }
    .footer-hours .time  { font-weight: 600; }
  </style>
</head>
<body>

  <!-- ════ PAGE HEADER ════ -->
  <div class="page-header">
    <div class="logo-wrap">
      {{#if propertyLogoUrl}}
        <img src="{{propertyLogoUrl}}" alt="Property Logo"
             style="width:90px;height:90px;object-fit:contain;" />
      {{else}}
        <svg viewBox="0 0 110 120" xmlns="http://www.w3.org/2000/svg" width="90" height="98">
          <g transform="translate(55,65)">
            <ellipse rx="8"  ry="32" fill="#c87d0a" transform="rotate(-50)"/>
            <ellipse rx="8"  ry="32" fill="#d98b10" transform="rotate(-35)"/>
            <ellipse rx="9"  ry="34" fill="#e8a015" transform="rotate(-18)"/>
            <ellipse rx="9"  ry="34" fill="#f0ab18" transform="rotate(0)"/>
            <ellipse rx="9"  ry="34" fill="#e8a015" transform="rotate(18)"/>
            <ellipse rx="8"  ry="32" fill="#d98b10" transform="rotate(35)"/>
            <ellipse rx="8"  ry="32" fill="#c87d0a" transform="rotate(50)"/>
            <ellipse rx="5.5" ry="22" fill="#f8cc50" transform="rotate(-18) translate(0,-4)"/>
            <ellipse rx="6"   ry="24" fill="#fdd455" transform="rotate(0)   translate(0,-5)"/>
            <ellipse rx="5.5" ry="22" fill="#f8cc50" transform="rotate(18)  translate(0,-4)"/>
            <circle  r="7" fill="#fde070"/>
          </g>
          <rect x="51" y="97" width="8" height="16" rx="4" fill="#8B6010"/>
          <ellipse cx="36" cy="108" rx="16" ry="6" fill="#6a8a20" transform="rotate(-20,36,108)"/>
          <ellipse cx="74" cy="108" rx="16" ry="6" fill="#6a8a20" transform="rotate(20,74,108)"/>
        </svg>
      {{/if}}
    </div>
    <div class="title-block">
      <div class="title-floor">{{property.name}}</div>
      <div class="title-main">{{company.name}} Utilities Charges</div>
    </div>
  </div>

  <!-- ════ INFO SECTION ════ -->
  <div class="info-section">
    <div class="info-row">
      <span class="info-label">အမည်</span>
      <span class="info-value">{{tenantName}}</span>
    </div>
    <div class="info-row">
      <span class="info-label">ဆိုင်အမှတ်</span>
      <span class="info-value">{{#if unit}}{{unit.unitNumber}}{{/if}}</span>
    </div>
    <div class="info-row">
      <span class="info-label">ဘောက်ချာနံပါတ်</span>
      <span class="info-value">{{invoiceNumber}}</span>
    </div>
    <div class="info-row">
      <span class="info-label">ကောက်ခံသည့်လ</span>
      <span class="info-value">{{monthYr periodFrom}}</span>
    </div>
    <div class="info-row">
      <span class="info-label">ငွေတောင်းခံလွှာပေးသည့်နေ့</span>
      <span class="info-value">{{dmy invoiceDate}}</span>
    </div>
    <div class="info-row">
      <span class="info-label">ငွေပေးသွင်းရန်နောက်ဆုံးနေ့</span>
      <span class="info-value">{{dmy dueDate}}</span>
    </div>
  </div>

  <!-- ════ LINE ITEMS TABLE ════ -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="col-no">စဉ်</th>
        <th class="col-img"></th>
        <th class="col-desc">အမျိုးအစားများ</th>
        <th class="col-sqft">Sq.ft/Unit/Watt</th>
        <th class="col-rate">ထိန်းသိမ်းခ</th>
        <th class="col-qty">နူန်း</th>
        <th class="col-amt">ကျသင့်ငွေ</th>
      </tr>
    </thead>
    <tbody>
      {{#each groups}}

      {{#if this.isSingle}}
      <!-- ── Single-item category: show data on the same row ── -->
      <tr class="row-group">
        <td class="col-no ta-center">{{this.no}}</td>
        <td class="col-img"></td>
        <td class="col-desc"><strong>{{this.items.[0].description}}</strong></td>
        <td class="col-sqft ta-right">{{n2 this.items.[0].quantity}}</td>
        <td class="col-rate ta-right">{{n2 this.items.[0].unitPrice}}</td>
        <td class="col-qty  ta-right"></td>
        <td class="col-amt  ta-right">{{mmk this.total}}</td>
      </tr>

      {{else}}
      <!-- ── Multi-item category: header row then sub-rows ── -->
      <tr class="row-group">
        <td class="col-no ta-center">{{this.no}}</td>
        <td class="col-img"></td>
        <td class="col-desc"><strong>{{this.name}}</strong></td>
        <td class="col-sqft"></td>
        <td class="col-rate"></td>
        <td class="col-qty"></td>
        <td class="col-amt"></td>
      </tr>
      {{#each this.items}}
      <tr class="row-sub">
        <td class="col-no"></td>
        <td class="col-img ta-center" style="font-size:11px;">{{this.subNo}}</td>
        <td class="col-desc pl-14">{{this.description}}</td>
        <td class="col-sqft ta-right">{{n2 this.quantity}}</td>
        <td class="col-rate ta-right">{{n2 this.unitPrice}}</td>
        <td class="col-qty  ta-right"></td>
        <td class="col-amt  ta-right">{{mmk this.lineTotal}}</td>
      </tr>
      {{/each}}

      {{/if}}
      {{/each}}
    </tbody>
    <tfoot>
      <tr class="row-grand">
        <td colspan="6" class="ta-right" style="padding-right:10px;">Grand Total ({{displayCurrency}})</td>
        <td class="col-amt ta-right">{{mmk grandTotal}}</td>
      </tr>
    </tfoot>
  </table>

  <!-- ════ FOOTER NOTES ════ -->
  <div class="footer-wrap">
    <div class="footer-note">
    <pre>
မှတ်ချက်၊၊    ၊၊သတ်မှတ်ရက်အတွင်း လာရောက်ပေးသွင်းနိုင်ရန် ပျက်ကွက်ပါက 
နောက်ကျကြေးအဖြစ် ကျသင့်ငွေ၏ (၁၀%) နှုန်းဖြင့် ဒါဏ်ကြေး ကောက်ခံမည်
      </pre>
    </div>
    <div class="footer-hours">
      <span class="label">ငွေလက်ခံချိန်</span>
      <span class="time">9:00 Am to 4:00 Pm</span>
    </div>
  </div>

</body>
</html>
`;

// ─── Singleton Browser Pool ────────────────────────────────────────────────────
// Launching Puppeteer for every PDF adds 1–3 s of cold-start overhead.
// We keep one browser process alive and reuse it across requests.
let _browser: import('puppeteer').Browser | null = null;
let _launching = false;
const _launchQueue: Array<(b: import('puppeteer').Browser) => void> = [];

async function getBrowser(): Promise<import('puppeteer').Browser> {
  if (_browser) {
    try { await _browser.version(); return _browser; }
    catch { logger.warn('Puppeteer browser disconnected — reconnecting…'); _browser = null; }
  }
  if (_launching) {
    return new Promise<import('puppeteer').Browser>((resolve) => { _launchQueue.push(resolve); });
  }
  _launching = true;
  try {
    logger.info('Launching Puppeteer browser (singleton)…');
    _browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    _browser.on('disconnected', () => { logger.warn('Puppeteer browser disconnected'); _browser = null; });
    for (const resolve of _launchQueue.splice(0)) resolve(_browser);
    return _browser;
  } finally {
    _launching = false;
  }
}

// ─── Service Class ─────────────────────────────────────────────────────────────
export class InvoicePdfService {
  private compiledTemplate = Handlebars.compile(INVOICE_TEMPLATE);

  /** Convert amount from one currency to another via the property's rate table. */
  private convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    rates: Array<{ currency: string; operator: string; rate: any; isBaseCurrency: boolean }>,
  ): number {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount;
    const baseCurrency = rates.find(r => r.isBaseCurrency)?.currency;
    if (!baseCurrency) return amount;

    // Step 1: fromCurrency → base
    let baseAmount = amount;
    if (fromCurrency !== baseCurrency) {
      const fromRow = rates.find(r => r.currency === fromCurrency);
      if (!fromRow) return amount;
      baseAmount = fromRow.operator === 'divide'
        ? amount / Number(fromRow.rate)
        : amount * Number(fromRow.rate);
    }

    // Step 2: base → toCurrency
    if (toCurrency === baseCurrency) return baseAmount;
    const toRow = rates.find(r => r.currency === toCurrency);
    if (!toRow) return baseAmount;
    return toRow.operator === 'divide'
      ? baseAmount * Number(toRow.rate)
      : baseAmount / Number(toRow.rate);
  }

  async generatePdfBuffer(invoiceId: string): Promise<Buffer> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: {
          include: {
            chargeType: { select: { code: true, name: true, category: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        tenant: {
          select: {
            id: true, firstName: true, lastName: true,
            companyName: true, tenantType: true, email: true,
            currency: true,
          },
        },
        unit:     { select: { id: true, unitNumber: true } },
        property: { select: { id: true, name: true, coverImageUrl: true, imageUrl: true } },
        company:  { select: { id: true, name: true } },
      },
    });
    if (!invoice) throw AppError.notFound('Invoice');

    // ── Fetch currency rates for the invoice's property ──────────────────────
    const tenantCurrency = (invoice.tenant as any).currency as string | null;
    const invCurrency    = invoice.currency || 'USD';
    const displayCurrency = tenantCurrency || invCurrency;

    let rates: Array<{ currency: string; operator: string; rate: any; isBaseCurrency: boolean }> = [];
    if (tenantCurrency && tenantCurrency !== invCurrency && invoice.propertyId) {
      rates = await prisma.currencyRate.findMany({
        where: { propertyId: invoice.propertyId, isActive: true },
        select: { currency: true, operator: true, rate: true, isBaseCurrency: true },
      });
    }

    const convert = (amount: number) =>
      tenantCurrency && tenantCurrency !== invCurrency && rates.length > 0
        ? this.convertAmount(amount, invCurrency, tenantCurrency, rates)
        : amount;

    const tenantName = invoice.tenant.tenantType === 'company'
      ? invoice.tenant.companyName || ''
      : [invoice.tenant.firstName, invoice.tenant.lastName].filter(Boolean).join(' - ');

    // ── Group lines by chargeType.category ──────────────────────────────────
    const categoryMap = new Map<string, typeof invoice.lines>();
    for (const line of invoice.lines) {
      const cat = line.chargeType.category || line.chargeType.name;
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(line);
    }

    const groups = Array.from(categoryMap.entries()).map(([cat, items], idx) => ({
      no: idx + 1,
      name: cat,
      isSingle: items.length === 1,
      items: items.map((item, iIdx) => ({
        ...item,
        subNo:     `${idx + 1}.${iIdx + 1}`,
        lineTotal: convert(Number(item.lineTotal)),
        quantity:  Number(item.quantity),
        unitPrice: convert(Number(item.unitPrice)),
      })),
      total: convert(items.reduce((s, l) => s + Number(l.lineTotal), 0)),
    }));

    const grandTotal = convert(Number(invoice.totalAmount));

    // ── Resolve property logo URL for Puppeteer ──────────────────────────────
    const rawLogoUrl = (invoice.property as any).coverImageUrl
      || (invoice.property as any).imageUrl
      || null;

    let propertyLogoUrl: string | null = null;
    if (rawLogoUrl) {
      if (rawLogoUrl.startsWith('http://') || rawLogoUrl.startsWith('https://')) {
        propertyLogoUrl = rawLogoUrl;
      } else {
        const port = process.env.PORT || 3000;
        propertyLogoUrl = `http://localhost:${port}${rawLogoUrl}`;
      }
    }

    const html = this.compiledTemplate({
      ...invoice,
      tenantName,
      groups,
      grandTotal,
      propertyLogoUrl,
      displayCurrency,
    });

    // ── Render PDF using the shared persistent browser ────────────────────────
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      page.setDefaultTimeout(30_000);
      // domcontentloaded is sufficient — HTML is fully self-contained
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      });

      logger.info(`PDF generated for invoice ${invoice.invoiceNumber}`);
      return Buffer.from(pdfBuffer);
    } finally {
      // Close only the page — browser stays alive for the next request
      await page.close().catch(() => {});
    }
  }
}

export const invoicePdfService = new InvoicePdfService();

