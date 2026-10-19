import type { InvoiceDetail, InvoiceListItem } from '../../../../store/api/billingApi';

const mmk = (v: unknown): string => {
  const n = Number(v);
  return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const n2 = (v: unknown): string => {
  const n = Number(v);
  if (!n || isNaN(n)) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const dmy = (d: unknown): string => {
  if (!d) return '';
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : (d as Date);
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

const monthYr = (d: unknown): string => {
  if (!d) return '';
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : (d as Date);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getTenantLabel(inv: InvoiceListItem | InvoiceDetail): string {
  if (!inv.tenant) return '-';
  if (inv.tenant.tenantType === 'company') {
    return inv.tenant.companyName || '-';
  }
  return [inv.tenant.firstName, inv.tenant.lastName].filter(Boolean).join(' - ') || '-';
}

function getFloorLabel(inv: InvoiceListItem | InvoiceDetail): string {
  if (!inv.unit) return '-';
  if (inv.unit.floorLabel) return inv.unit.floorLabel;
  if (inv.unit.floorNumber !== null && inv.unit.floorNumber !== undefined) return `Floor ${inv.unit.floorNumber}`;
  return '-';
}

function renderInvoicePaperHtml(inv: InvoiceListItem | InvoiceDetail): string {
  const invoiceNo = inv.invoiceNumber || '-';
  const displayCurrency = inv.currency || 'USD';
  const tenantName = getTenantLabel(inv);

  const categoryMap = new Map<string, NonNullable<InvoiceListItem['lines']>>();
  for (const line of inv.lines || []) {
    const cat = line.chargeType?.category || line.chargeType?.name || 'General';
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(line);
  }

  const groups = Array.from(categoryMap.entries()).map(([cat, items], idx) => ({
    no: idx + 1,
    name: cat,
    isSingle: items.length === 1,
    items: items.map((item, iIdx) => ({
      ...item,
      subNo: `${idx + 1}.${iIdx + 1}`,
      chargeTypeName: item.chargeType?.name || item.description || '',
      lineTotal: Number(item.lineTotal || item.amount || (Number(item.quantity) * Number(item.unitPrice))),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
    total: items.reduce((s, l) => s + Number(l.lineTotal || l.amount || (Number(l.quantity) * Number(l.unitPrice))), 0),
  }));

  const grandTotal = Number(inv.totalAmount) || 0;
  let propertyLogoUrl = inv.property?.coverImageUrl || inv.property?.imageUrl || null;
  if (propertyLogoUrl && !propertyLogoUrl.startsWith('http://') && !propertyLogoUrl.startsWith('https://') && !propertyLogoUrl.startsWith('data:')) {
    propertyLogoUrl = `${window.location.origin}${propertyLogoUrl.startsWith('/') ? '' : '/'}${propertyLogoUrl}`;
  }

  const rowsHtml = groups.length > 0
    ? groups.map((g) => {
        if (g.isSingle) {
          const item = g.items[0];
          return `
            <tr class="row-group">
              <td class="col-no ta-center">${g.no}</td>
              <td class="col-img"></td>
              <td class="col-desc">${escapeHtml(item.chargeTypeName)}</td>
              <td class="col-sqft ta-right">${n2(item.quantity)}</td>
              <td class="col-rate ta-right">${n2(item.unitPrice)}</td>
              <td class="col-qty ta-right"></td>
              <td class="col-amt ta-right">${mmk(g.total)}</td>
            </tr>
          `;
        }

        const subRows = g.items.map((item) => `
          <tr class="row-sub">
            <td class="col-no"></td>
            <td class="col-img ta-center" style="font-size:11px;">${item.subNo}</td>
            <td class="col-desc pl-14">${escapeHtml(item.chargeTypeName)}</td>
            <td class="col-sqft ta-right">${n2(item.quantity)}</td>
            <td class="col-rate ta-right">${n2(item.unitPrice)}</td>
            <td class="col-qty ta-right"></td>
            <td class="col-amt ta-right">${mmk(item.lineTotal)}</td>
          </tr>
        `).join('');

        return `
          <tr class="row-group">
            <td class="col-no ta-center">${g.no}</td>
            <td class="col-img"></td>
            <td class="col-desc">${escapeHtml(g.name)}</td>
            <td class="col-sqft"></td>
            <td class="col-rate"></td>
            <td class="col-qty"></td>
            <td class="col-amt"></td>
          </tr>
          ${subRows}
        `;
      }).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:18px;color:#94a3b8;">No line items</td></tr>`;

  return `
    <div class="invoice-paper">
      <div class="page-header">
        <div class="logo-wrap">
          ${propertyLogoUrl ? `
            <img src="${escapeHtml(propertyLogoUrl)}" alt="${escapeHtml(inv.property?.name || 'Property')}"
                 style="width:85px;height:85px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" />
          ` : `
            <div style="width:85px;height:85px;border-radius:6px;background:#f8fafc;border:1px dashed #cbd5e1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#64748b;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                <path d="M9 22v-4h6v4"></path>
                <path d="M8 6h.01"></path>
                <path d="M16 6h.01"></path>
                <path d="M8 10h.01"></path>
                <path d="M16 10h.01"></path>
                <path d="M8 14h.01"></path>
                <path d="M16 14h.01"></path>
              </svg>
              <span style="font-size:9px;font-weight:600;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Property</span>
            </div>
          `}
        </div>
        <div class="title-block">
          <div class="title-floor">${escapeHtml(inv.property?.name || '')}</div>
          <div class="title-main">${escapeHtml(inv.property?.name || 'PMS')} Utilities Charges</div>
        </div>
      </div>

      <div class="info-section">
        <div class="info-row">
          <span class="info-label">အမည်</span>
          <span class="info-value">${escapeHtml(tenantName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">ဆိုင်အမှတ်</span>
          <span class="info-value">${escapeHtml(inv.unit?.unitNumber || '')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">ဘောက်ချာနံပါတ်</span>
          <span class="info-value">${escapeHtml(invoiceNo)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">ကောက်ခံသည့်လ</span>
          <span class="info-value">${escapeHtml(monthYr(inv.periodFrom || inv.invoiceDate))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">ငွေတောင်းခံလွှာပေးသည့်နေ့</span>
          <span class="info-value">${escapeHtml(dmy(inv.invoiceDate))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">ငွေပေးသွင်းရန်နောက်ဆုံးနေ့</span>
          <span class="info-value">${escapeHtml(dmy(inv.dueDate))}</span>
        </div>
      </div>

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
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr class="row-grand">
            <td colspan="6" class="ta-right" style="padding-right:10px;">Grand Total (${escapeHtml(displayCurrency)})</td>
            <td class="col-amt ta-right">${mmk(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="footer-wrap">
        <div class="footer-note">
          <pre style="font-family:inherit;white-space:pre-wrap;">
မှတ်ချက်၊၊    ၊၊သတ်မှတ်ရက်အတွင်း လာရောက်ပေးသွင်းနိုင်ရန် ပျက်ကွက်ပါက 
နောက်ကျကြေးအဖြစ် ကျသင့်ငွေ၏ (၁၀%) နှုန်းဖြင့် ဒါဏ်ကြေး ကောက်ခံမည်
          </pre>
        </div>
        <div class="footer-hours">
          <span class="label">ငွေလက်ခံချိန်</span>
          <span class="time">9:00 Am to 4:00 Pm</span>
        </div>
      </div>
    </div>
  `;
}

export function generateInvoiceHtml(inv: InvoiceDetail | InvoiceListItem, multiInvoices?: Array<InvoiceDetail | InvoiceListItem>): string {
  const list = multiInvoices && multiInvoices.length > 0 ? multiInvoices : [inv];
  const titleText = list.length === 1
    ? `Invoice - ${escapeHtml(list[0].invoiceNumber || '-')}`
    : `Invoice Vouchers (${list.length})`;

  const papersHtml = list.map((item) => renderInvoicePaperHtml(item)).join('\n');

  return `<!doctype html>
<html lang="my">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleText}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      background: #525659;
      font-family: 'Noto Sans Myanmar', 'Pyidaungsu', 'Myanmar Text', 'Padauk', Arial, sans-serif;
      font-size: 12px;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 24px;
      background: #1e293b;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .preview-toolbar-title {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
    }
    .preview-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .preview-btn {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .preview-btn-print {
      background: #10b981;
      color: #fff;
    }
    .preview-btn-print:hover {
      background: #059669;
    }
    .preview-btn-close {
      background: rgba(255,255,255,0.12);
      color: #f1f5f9;
      border-color: rgba(255,255,255,0.2);
    }
    .preview-btn-close:hover {
      background: rgba(255,255,255,0.22);
    }

    .preview-container {
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      min-height: calc(100vh - 49px);
    }

    .invoice-paper {
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      padding: 16mm 18mm 18mm 18mm;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
      border-radius: 2px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      page-break-after: always;
    }
    .invoice-paper:last-child {
      page-break-after: auto;
    }

    .page-header {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 10px;
    }
    .logo-wrap {
      width: 85px;
      height: 85px;
      flex-shrink: 0;
      margin-right: 20px;
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
      margin-bottom: 4px;
      letter-spacing: 0.3px;
    }
    .title-main {
      font-size: 15px;
      font-weight: 700;
    }

    .info-section {
      margin-bottom: 16px;
    }
    .info-row {
      display: flex;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .info-label {
      width: 220px;
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

    .col-no   { width: 34px;  text-align: center; }
    .col-img  { width: 34px;  text-align: center; }
    .col-desc { text-align: left; }
    .col-sqft { width: 88px;  text-align: center; }
    .col-rate { width: 82px;  text-align: right;  }
    .col-qty  { width: 70px;  text-align: right;  }
    .col-amt  { width: 105px; text-align: right;  }

    .row-group td { font-weight: 400; }
    .row-sub   td { font-weight: 400; }
    .row-grand td { font-weight: 700; font-size: 12px; background: #fff; }

    .ta-right  { text-align: right  !important; }
    .ta-center { text-align: center !important; }
    .pl-14     { padding-left: 14px !important; }

    .footer-wrap {
      margin-top: 18px;
      font-size: 11.5px;
    }
    .footer-note { margin-bottom: 6px; line-height: 1.6; }
    .footer-hours { margin-top: 8px; display: flex; align-items: baseline; gap: 12px; }
    .footer-hours .label { white-space: nowrap; }
    .footer-hours .time  { font-weight: 600; }

    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    @media print {
      html, body {
        background: #fff !important;
        width: 210mm;
      }
      .no-print {
        display: none !important;
      }
      .preview-container {
        padding: 0 !important;
        margin: 0 !important;
        background: #fff !important;
        min-height: auto !important;
        display: block !important;
      }
      .invoice-paper {
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="preview-toolbar-title">${titleText}</div>
    <div class="preview-toolbar-actions">
      <button class="preview-btn preview-btn-print" onclick="window.print()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save as PDF
      </button>
      <button class="preview-btn preview-btn-close" onclick="window.close()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        Close
      </button>
    </div>
  </div>

  <div class="preview-container">
    ${papersHtml}
  </div>
</body>
</html>`;
}

export function openInvoicePrintPreview(inv: InvoiceDetail): void {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to view the invoice preview.');
    return;
  }
  const html = generateInvoiceHtml(inv);
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

export interface InvoiceReportFilterInfo {
  fromDate?: string;
  toDate?: string;
  floor?: string;
  unit?: string;
  tenant?: string;
  status?: string;
}

export function openInvoicesReportPreview(options: {
  reportType: 'summary' | 'detail' | 'voucher';
  invoices: InvoiceListItem[];
  filters: InvoiceReportFilterInfo;
}): void {
  const { reportType, invoices, filters } = options;
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to view the report.');
    return;
  }

  if (reportType === 'voucher') {
    const html = generateInvoiceHtml(invoices[0], invoices);
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    return;
  }

  const reportTitle = reportType === 'summary' ? 'Invoice Summary Report' : 'Invoice Detail Report';
  const generatedAt = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  // Group totals by currency
  const totalsByCurrency: Record<string, { subtotal: number; tax: number; total: number; paid: number; outstanding: number }> = {};
  for (const inv of invoices) {
    const cur = inv.currency || 'USD';
    if (!totalsByCurrency[cur]) {
      totalsByCurrency[cur] = { subtotal: 0, tax: 0, total: 0, paid: 0, outstanding: 0 };
    }
    const totalNum = Number(inv.totalAmount) || 0;
    const paidNum = Number(inv.paidAmount) || 0;
    totalsByCurrency[cur].subtotal += Number(inv.subtotal) || 0;
    totalsByCurrency[cur].tax += Number(inv.taxAmount) || 0;
    totalsByCurrency[cur].total += totalNum;
    totalsByCurrency[cur].paid += paidNum;
    totalsByCurrency[cur].outstanding += Math.max(0, totalNum - paidNum);
  }

  const filterBadges = [
    filters.fromDate || filters.toDate
      ? `Date Range: ${filters.fromDate || 'Any'} to ${filters.toDate || 'Any'}`
      : 'Date Range: All Dates',
    `Floor: ${filters.floor || 'All Floors'}`,
    `Unit: ${filters.unit || 'All Units'}`,
    `Tenant: ${filters.tenant || 'All Tenants'}`,
    `Status: ${filters.status ? filters.status.replace('_', ' ').toUpperCase() : 'All Statuses'}`,
  ];

  const tableHtml = reportType === 'summary'
    ? `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:40px;text-align:center;">No.</th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Due Date</th>
            <th>Tenant</th>
            <th>Floor</th>
            <th>Unit</th>
            <th style="text-align:center;">Status</th>
            <th style="text-align:center;">Curr</th>
            <th style="text-align:right;">Total</th>
            <th style="text-align:right;">Paid</th>
            <th style="text-align:right;">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((inv, idx) => {
            const totalNum = Number(inv.totalAmount) || 0;
            const paidNum = Number(inv.paidAmount) || 0;
            const outNum = Math.max(0, totalNum - paidNum);
            return `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="font-weight:600;">${escapeHtml(inv.invoiceNumber)}</td>
                <td>${escapeHtml(dmy(inv.invoiceDate))}</td>
                <td>${escapeHtml(dmy(inv.dueDate))}</td>
                <td>${escapeHtml(getTenantLabel(inv))}</td>
                <td>${escapeHtml(getFloorLabel(inv))}</td>
                <td>${escapeHtml(inv.unit?.unitNumber || '-')}</td>
                <td style="text-align:center;text-transform:capitalize;">${escapeHtml(inv.status.replace('_', ' '))}</td>
                <td style="text-align:center;">${escapeHtml(inv.currency || 'USD')}</td>
                <td style="text-align:right;font-weight:600;">${mmk(totalNum)}</td>
                <td style="text-align:right;color:#059669;">${mmk(paidNum)}</td>
                <td style="text-align:right;color:${outNum > 0 ? '#dc2626' : '#64748b'};font-weight:600;">${mmk(outNum)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          ${Object.entries(totalsByCurrency).map(([cur, t]) => `
            <tr class="summary-row">
              <td colspan="9" style="text-align:right;font-weight:700;">Grand Total (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:700;">${mmk(t.total)}</td>
              <td style="text-align:right;font-weight:700;color:#059669;">${mmk(t.paid)}</td>
              <td style="text-align:right;font-weight:700;color:${t.outstanding > 0 ? '#dc2626' : '#0f172a'};">${mmk(t.outstanding)}</td>
            </tr>
          `).join('')}
        </tfoot>
      </table>
    `
    : `
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:40px;text-align:center;">No.</th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Tenant</th>
            <th>Floor / Unit</th>
            <th>Charge Code</th>
            <th>Description</th>
            <th>Category</th>
            <th style="text-align:right;">Qty</th>
            <th style="text-align:right;">Unit Price</th>
            <th style="text-align:right;">Tax</th>
            <th style="text-align:right;">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((inv, invIdx) => {
            const lines = inv.lines && inv.lines.length > 0 ? inv.lines : [];
            const floorUnit = [getFloorLabel(inv), inv.unit?.unitNumber].filter((v) => v && v !== '-').join(' / ') || '-';
            if (lines.length === 0) {
              return `
                <tr>
                  <td style="text-align:center;">${invIdx + 1}</td>
                  <td style="font-weight:600;">${escapeHtml(inv.invoiceNumber)}</td>
                  <td>${escapeHtml(dmy(inv.invoiceDate))}</td>
                  <td>${escapeHtml(getTenantLabel(inv))}</td>
                  <td>${escapeHtml(floorUnit)}</td>
                  <td colspan="6" style="color:#64748b;">Invoice Total (${escapeHtml(inv.currency || 'USD')})</td>
                  <td style="text-align:right;font-weight:600;">${mmk(inv.totalAmount)}</td>
                </tr>
              `;
            }
            return lines.map((line, lIdx) => `
              <tr>
                <td style="text-align:center;">${lIdx === 0 ? invIdx + 1 : ''}</td>
                <td style="font-weight:600;">${lIdx === 0 ? escapeHtml(inv.invoiceNumber) : ''}</td>
                <td>${lIdx === 0 ? escapeHtml(dmy(inv.invoiceDate)) : ''}</td>
                <td>${lIdx === 0 ? escapeHtml(getTenantLabel(inv)) : ''}</td>
                <td>${lIdx === 0 ? escapeHtml(floorUnit) : ''}</td>
                <td>${escapeHtml(line.chargeType?.code || '-')}</td>
                <td>${escapeHtml(line.description || line.chargeType?.name || '-')}</td>
                <td style="text-transform:capitalize;">${escapeHtml(line.chargeType?.category || '-')}</td>
                <td style="text-align:right;">${mmk(line.quantity)}</td>
                <td style="text-align:right;">${mmk(line.unitPrice)}</td>
                <td style="text-align:right;">${mmk(line.taxAmount)}</td>
                <td style="text-align:right;font-weight:600;">${mmk(line.lineTotal || line.amount)}</td>
              </tr>
            `).join('') + `
              <tr style="background:#f8fafc;">
                <td colspan="11" style="text-align:right;font-weight:600;font-size:11px;color:#475569;">
                  Subtotal for ${escapeHtml(inv.invoiceNumber)} (${escapeHtml(inv.currency || 'USD')}) — Paid: ${mmk(inv.paidAmount)}
                </td>
                <td style="text-align:right;font-weight:700;">${mmk(inv.totalAmount)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          ${Object.entries(totalsByCurrency).map(([cur, t]) => `
            <tr class="summary-row">
              <td colspan="10" style="text-align:right;font-weight:700;">Grand Total (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:700;">${mmk(t.tax)}</td>
              <td style="text-align:right;font-weight:700;">${mmk(t.total)}</td>
            </tr>
          `).join('')}
        </tfoot>
      </table>
    `;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #525659;
      font-family: 'Inter', 'Noto Sans Myanmar', Arial, sans-serif;
      font-size: 12px;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 24px;
      background: #1e293b;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .preview-toolbar-title {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
    }
    .preview-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .preview-btn {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .preview-btn-print { background: #10b981; color: #fff; }
    .preview-btn-print:hover { background: #059669; }
    .preview-btn-close {
      background: rgba(255,255,255,0.12);
      color: #f1f5f9;
      border-color: rgba(255,255,255,0.2);
    }
    .preview-container {
      padding: 24px 16px;
      display: flex;
      justify-content: center;
    }
    .report-sheet {
      background: #fff;
      width: 297mm;
      min-height: 210mm;
      padding: 14mm 16mm;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      border-radius: 2px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .report-title { font-size: 20px; font-weight: 800; color: #0f172a; }
    .report-subtitle { font-size: 12px; color: #475569; margin-top: 4px; }
    .report-meta { text-align: right; font-size: 11px; color: #475569; line-height: 1.5; }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }
    .filter-chip {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
    }
    .report-table th,
    .report-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: middle;
    }
    .report-table thead th {
      background: #0f172a;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .report-table tbody tr:nth-child(even) { background: #f8fafc; }
    .summary-row td {
      background: #f1f5f9;
      border-top: 2px solid #0f172a;
      font-size: 12px;
    }
    @page { size: A4 landscape; margin: 10mm 12mm; }
    @media print {
      body { background: #fff !important; }
      .no-print { display: none !important; }
      .preview-container { padding: 0 !important; display: block !important; }
      .report-sheet {
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="preview-toolbar-title">${escapeHtml(reportTitle)} (${invoices.length} invoice${invoices.length !== 1 ? 's' : ''})</div>
    <div class="preview-toolbar-actions">
      <button class="preview-btn preview-btn-print" onclick="window.print()">
        Print / Save as PDF
      </button>
      <button class="preview-btn preview-btn-close" onclick="window.close()">
        Close
      </button>
    </div>
  </div>
  <div class="preview-container">
    <div class="report-sheet">
      <div class="report-header">
        <div>
          <div class="report-title">${escapeHtml(reportTitle)}</div>
          <div class="report-subtitle">${escapeHtml(invoices[0]?.property?.name || 'All Properties')}</div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
          <div><strong>Total Invoices:</strong> ${invoices.length}</div>
        </div>
      </div>
      <div class="filter-bar">
        ${filterBadges.map((b) => `<span class="filter-chip">${escapeHtml(b)}</span>`).join('')}
      </div>
      ${tableHtml}
    </div>
  </div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

