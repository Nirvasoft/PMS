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

function getReportTenantLabel(inv: InvoiceListItem | InvoiceDetail): string {
  if (!inv.tenant) return '-';
  if (inv.tenant.tenantType && inv.tenant.tenantType !== 'individual') {
    return inv.tenant.companyName || '-';
  }
  return inv.tenant.lastName || inv.tenant.firstName || '-';
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

  const MAX_ROWS_PER_PAGE = 15;
  const allRows: Array<{ html: string; isGroupHeader?: boolean }> = [];

  for (const g of groups) {
    if (g.isSingle) {
      const item = g.items[0];
      allRows.push({
        isGroupHeader: false,
        html: `
          <tr class="row-group">
            <td class="col-no ta-center">${g.no}</td>
            <td class="col-img"></td>
            <td class="col-desc">${escapeHtml(item.chargeTypeName)}</td>
            <td class="col-sqft ta-right">${n2(item.quantity)}</td>
            <td class="col-rate ta-right"></td>
            <td class="col-qty ta-right">${n2(item.unitPrice)}</td>
            <td class="col-amt ta-right">${mmk(g.total)}</td>
          </tr>
        `,
      });
    } else {
      allRows.push({
        isGroupHeader: true,
        html: `
          <tr class="row-group">
            <td class="col-no ta-center">${g.no}</td>
            <td class="col-img"></td>
            <td class="col-desc" style="font-weight: 700;">${escapeHtml(g.name)}</td>
            <td class="col-sqft"></td>
            <td class="col-rate"></td>
            <td class="col-qty"></td>
            <td class="col-amt"></td>
          </tr>
        `,
      });
      for (const item of g.items) {
        allRows.push({
          isGroupHeader: false,
          html: `
            <tr class="row-sub">
              <td class="col-no"></td>
              <td class="col-img ta-center" style="font-size:11px;">${item.subNo}</td>
              <td class="col-desc pl-14">${escapeHtml(item.chargeTypeName)}</td>
              <td class="col-sqft ta-right">${n2(item.quantity)}</td>
              <td class="col-rate ta-right"></td>
              <td class="col-qty ta-right">${n2(item.unitPrice)}</td>
              <td class="col-amt ta-right">${mmk(item.lineTotal)}</td>
            </tr>
          `,
        });
      }
    }
  }

  const FIRST_PAGE_MAX_ROWS = 15;
  const NEXT_PAGE_MAX_ROWS = 21;
  const rowPages: string[][] = [];
  if (allRows.length === 0) {
    rowPages.push([`<tr><td colspan="7" style="text-align:center;padding:18px;color:#94a3b8;">No line items</td></tr>`]);
  } else {
    let currentChunk: Array<{ html: string; isGroupHeader?: boolean }> = [];
    for (let i = 0; i < allRows.length; i++) {
      currentChunk.push(allRows[i]);
      const maxForCurrentPage = rowPages.length === 0 ? FIRST_PAGE_MAX_ROWS : NEXT_PAGE_MAX_ROWS;
      if (currentChunk.length >= maxForCurrentPage) {
        if (currentChunk[currentChunk.length - 1].isGroupHeader && currentChunk.length > 1) {
          const orphanHeader = currentChunk.pop()!;
          rowPages.push(currentChunk.map((r) => r.html));
          currentChunk = [orphanHeader];
        } else {
          rowPages.push(currentChunk.map((r) => r.html));
          currentChunk = [];
        }
      }
    }
    if (currentChunk.length > 0) {
      rowPages.push(currentChunk.map((r) => r.html));
    }
  }

  const totalInvPages = rowPages.length;

  return rowPages.map((pageRows, pageIdx) => {
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalInvPages - 1;
    const tfootHtml = isLastPage
      ? `
        <tfoot>
          <tr class="row-grand">
            <td colspan="6" class="ta-right" style="padding-right:10px;">Grand Total (${escapeHtml(displayCurrency)})</td>
            <td class="col-amt ta-right">${mmk(grandTotal)}</td>
          </tr>
        </tfoot>
      `
      : '';

    const infoSectionHtml = isFirstPage
      ? `
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
      `
      : '';

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

        ${infoSectionHtml}

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
            ${pageRows.join('')}
          </tbody>
          ${tfootHtml}
        </table>

        <div class="footer-wrap">
          <div class="footer-note">
            <pre style="font-family:inherit;white-space:pre-wrap;margin:0;">မှတ်ချက်၊၊    ၊၊သတ်မှတ်ရက်အတွင်း လာရောက်ပေးသွင်းနိုင်ရန် ပျက်ကွက်ပါက 
နောက်ကျကြေးအဖြစ် ကျသင့်ငွေ၏ (၁၀%) နှုန်းဖြင့် ဒါဏ်ကြေး ကောက်ခံမည်</pre>
          </div>
          <div class="footer-hours" style="justify-content:space-between;">
            <div style="display:flex;align-items:baseline;gap:12px;">
              <span class="label">ငွေလက်ခံချိန်</span>
              <span class="time">9:00 Am to 4:00 Pm</span>
            </div>
            ${totalInvPages > 1 ? `<span style="font-size:11px;color:#475569;">Page ${pageIdx + 1} of ${totalInvPages}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('\n');
}

export interface InvoiceReportPaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalsByCurrency?: Record<string, { subtotal: number; tax: number; total: number; paid: number; outstanding: number }>;
  onPageChange?: (newPage: number, newPageSize: number) => void;
}

export function generateInvoiceHtml(
  inv: InvoiceDetail | InvoiceListItem,
  multiInvoices?: Array<InvoiceDetail | InvoiceListItem>,
  pagination?: InvoiceReportPaginationInfo,
): string {
  const list = multiInvoices && multiInvoices.length > 0 ? multiInvoices : [inv];
  const totalCount = pagination ? pagination.total : list.length;
  const startRow = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 1;
  const endRow = pagination ? Math.min(pagination.page * pagination.pageSize, totalCount) : list.length;
  const titleText = list.length === 1 && !pagination
    ? `Invoice - ${escapeHtml(list[0].invoiceNumber || '-')}`
    : pagination
      ? `Invoice Vouchers (Showing ${startRow.toLocaleString()}–${endRow.toLocaleString()} of ${totalCount.toLocaleString()})`
      : `Invoice Vouchers (${list.length})`;

  const papersHtml = list.map((item) => renderInvoicePaperHtml(item)).join('\n');

  const paginationControlsHtml = pagination
    ? `
      <div style="display:flex;align-items:center;gap:8px;margin-right:10px;background:rgba(255,255,255,0.08);padding:4px 10px;border-radius:6px;">
        <span style="font-size:12px;color:#cbd5e1;">Rows/Page:</span>
        <select id="rpt-page-size" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:3px 6px;font-size:12px;cursor:pointer;">
          ${[100, 500, 1000].map((sz) => `<option value="${sz}" ${pagination.pageSize === sz ? 'selected' : ''}>${sz}</option>`).join('')}
        </select>
        <button id="rpt-prev-btn" class="preview-btn" style="padding:4px 10px;font-size:12px;background:#334155;color:#fff;${pagination.page <= 1 ? 'opacity:0.4;cursor:not-allowed;' : ''}" ${pagination.page <= 1 ? 'disabled' : ''}>
          ◀ Prev
        </button>
        <span style="font-size:12px;font-weight:600;color:#f8fafc;min-width:95px;text-align:center;">
          Page ${pagination.page.toLocaleString()} / ${Math.max(1, pagination.totalPages).toLocaleString()}
        </span>
        <button id="rpt-next-btn" class="preview-btn" style="padding:4px 10px;font-size:12px;background:#334155;color:#fff;${pagination.page >= pagination.totalPages ? 'opacity:0.4;cursor:not-allowed;' : ''}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>
          Next ▶
        </button>
      </div>
    `
    : '';

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
      margin-top: 16px;
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
      margin-top: 16px;
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
      margin-top: auto;
      padding-top: 18px;
      font-size: 11.5px;
      break-inside: avoid;
      page-break-inside: avoid;
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
        min-height: calc(297mm - 24mm) !important;
        display: flex !important;
        flex-direction: column !important;
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
      ${paginationControlsHtml}
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

export type InvoiceReportType = 'summary' | 'detail' | 'voucher';

export interface InvoiceReportFilterInfo {
  fromDate?: string;
  toDate?: string;
  currency?: string;
  billType?: string;
  startInvoice?: string;
  endInvoice?: string;
  floor?: string;
  unit?: string;
  tenant?: string;
  status?: string;
}

function bindPaginationEvents(win: Window, pagination?: InvoiceReportPaginationInfo): void {
  if (!pagination?.onPageChange) return;
  const doc = win.document;
  const prevBtn = doc.getElementById('rpt-prev-btn') as HTMLButtonElement | null;
  const nextBtn = doc.getElementById('rpt-next-btn') as HTMLButtonElement | null;
  const sizeSelect = doc.getElementById('rpt-page-size') as HTMLSelectElement | null;

  const setLoadingState = (msg: string) => {
    const titleEl = doc.querySelector('.preview-toolbar-title');
    if (titleEl) titleEl.textContent = msg;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (sizeSelect) sizeSelect.disabled = true;
  };

  if (prevBtn && pagination.page > 1) {
    prevBtn.onclick = () => {
      setLoadingState(`Loading Page ${pagination.page - 1}...`);
      pagination.onPageChange!(pagination.page - 1, pagination.pageSize);
    };
  }
  if (nextBtn && pagination.page < pagination.totalPages) {
    nextBtn.onclick = () => {
      setLoadingState(`Loading Page ${pagination.page + 1}...`);
      pagination.onPageChange!(pagination.page + 1, pagination.pageSize);
    };
  }
  if (sizeSelect) {
    sizeSelect.onchange = () => {
      const newSize = Number(sizeSelect.value) || 500;
      setLoadingState(`Loading ${newSize} rows per page...`);
      pagination.onPageChange!(1, newSize);
    };
  }
}

export function openInvoicesReportPreview(options: {
  reportType: 'summary' | 'detail' | 'voucher';
  invoices: InvoiceListItem[];
  filters: InvoiceReportFilterInfo;
  targetWindow?: Window | null;
  pagination?: InvoiceReportPaginationInfo;
}): boolean {
  const { reportType, invoices, filters, targetWindow, pagination } = options;
  const win = targetWindow ?? window.open('', '_blank');
  if (!win) {
    return false;
  }

  if (reportType === 'voucher') {
    const html = generateInvoiceHtml(invoices[0], invoices, pagination);
    win.document.open();
    win.document.write(html);
    win.document.close();
    bindPaginationEvents(win, pagination);
    win.focus();
    return true;
  }

  const reportTitle = reportType === 'summary' ? 'Invoice Summary Report' : 'Invoice Detail Report';
  const firstProp = invoices.find((inv) => inv.property)?.property;
  let reportPropertyLogoUrl = firstProp?.coverImageUrl || firstProp?.imageUrl || null;
  if (
    reportPropertyLogoUrl &&
    !reportPropertyLogoUrl.startsWith('http://') &&
    !reportPropertyLogoUrl.startsWith('https://') &&
    !reportPropertyLogoUrl.startsWith('data:')
  ) {
    reportPropertyLogoUrl = `${window.location.origin}${reportPropertyLogoUrl.startsWith('/') ? '' : '/'}${reportPropertyLogoUrl}`;
  }
  const generatedAt = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const pageOffset = pagination ? (pagination.page - 1) * pagination.pageSize : 0;
  const totalCount = pagination ? pagination.total : invoices.length;
  const startRow = invoices.length > 0 ? pageOffset + 1 : 0;
  const endRow = pageOffset + invoices.length;

  // Group current page totals by currency
  const pageTotalsByCurrency: Record<string, { subtotal: number; tax: number; total: number; paid: number; outstanding: number }> = {};
  for (const inv of invoices) {
    const cur = inv.currency || 'USD';
    if (!pageTotalsByCurrency[cur]) {
      pageTotalsByCurrency[cur] = { subtotal: 0, tax: 0, total: 0, paid: 0, outstanding: 0 };
    }
    const totalNum = Number(inv.totalAmount) || 0;
    const paidNum = Number(inv.paidAmount) || 0;
    pageTotalsByCurrency[cur].subtotal += Number(inv.subtotal) || 0;
    pageTotalsByCurrency[cur].tax += Number(inv.taxAmount) || 0;
    pageTotalsByCurrency[cur].total += totalNum;
    pageTotalsByCurrency[cur].paid += paidNum;
    pageTotalsByCurrency[cur].outstanding += Math.max(0, totalNum - paidNum);
  }

  const grandTotalsByCurrency = pagination?.totalsByCurrency && Object.keys(pagination.totalsByCurrency).length > 0
    ? pagination.totalsByCurrency
    : pageTotalsByCurrency;
  const hasMultiplePages = Boolean(pagination && pagination.totalPages > 1);

  const filterBadges = [
    filters.fromDate || filters.toDate
      ? `Date Range: ${filters.fromDate || 'Any'} to ${filters.toDate || 'Any'}`
      : 'Date Range: All Dates',
    `Currency: ${filters.currency || 'All Currencies'}`,
    `Bill Type: ${filters.billType || 'All Bills'}`,
    ...(filters.startInvoice || filters.endInvoice
      ? [`Invoice #: ${filters.startInvoice || 'Start'} to ${filters.endInvoice || 'End'}`]
      : []),
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
                <td style="text-align:center;">${pageOffset + idx + 1}</td>
                <td>${escapeHtml(inv.invoiceNumber)}</td>
                <td>${escapeHtml(dmy(inv.invoiceDate))}</td>
                <td>${escapeHtml(dmy(inv.dueDate))}</td>
                <td>${escapeHtml(getReportTenantLabel(inv))}</td>
                <td>${escapeHtml(getFloorLabel(inv))}</td>
                <td>${escapeHtml(inv.unit?.unitNumber || '-')}</td>
                <td style="text-align:center;">${escapeHtml(inv.currency || 'USD')}</td>
                <td style="text-align:right;font-weight:600;">${mmk(totalNum)}</td>
                <td style="text-align:right;color:#059669;">${mmk(paidNum)}</td>
                <td style="text-align:right;color:${outNum > 0 ? '#dc2626' : '#64748b'};font-weight:600;">${mmk(outNum)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          ${hasMultiplePages ? Object.entries(pageTotalsByCurrency).map(([cur, t]) => `
            <tr style="background:#f8fafc;">
              <td colspan="8" style="text-align:right;font-weight:600;color:#475569;">Page ${pagination!.page} Subtotal (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:600;">${mmk(t.total)}</td>
              <td style="text-align:right;font-weight:600;color:#059669;">${mmk(t.paid)}</td>
              <td style="text-align:right;font-weight:600;color:${t.outstanding > 0 ? '#dc2626' : '#0f172a'};">${mmk(t.outstanding)}</td>
            </tr>
          `).join('') : ''}
          ${Object.entries(grandTotalsByCurrency).map(([cur, t]) => `
            <tr class="summary-row">
              <td colspan="8" style="text-align:right;font-weight:700;">Grand Total — All ${totalCount.toLocaleString()} Invoices (${escapeHtml(cur)})</td>
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
            const rowNum = pageOffset + invIdx + 1;
            if (lines.length === 0) {
              return `
                <tr>
                  <td style="text-align:center;">${rowNum}</td>
                  <td>${escapeHtml(inv.invoiceNumber)}</td>
                  <td>${escapeHtml(dmy(inv.invoiceDate))}</td>
                  <td>${escapeHtml(getReportTenantLabel(inv))}</td>
                  <td>${escapeHtml(floorUnit)}</td>
                  <td colspan="6" style="color:#64748b;">Invoice Total (${escapeHtml(inv.currency || 'USD')})</td>
                  <td style="text-align:right;font-weight:600;">${mmk(inv.totalAmount)}</td>
                </tr>
              `;
            }
            return lines.map((line, lIdx) => `
              <tr>
                <td style="text-align:center;">${lIdx === 0 ? rowNum : ''}</td>
                <td>${lIdx === 0 ? escapeHtml(inv.invoiceNumber) : ''}</td>
                <td>${lIdx === 0 ? escapeHtml(dmy(inv.invoiceDate)) : ''}</td>
                <td>${lIdx === 0 ? escapeHtml(getReportTenantLabel(inv)) : ''}</td>
                <td>${lIdx === 0 ? escapeHtml(floorUnit) : ''}</td>
                <td>${escapeHtml(line.chargeType?.code || '-')}</td>
                <td>${escapeHtml(line.description || line.chargeType?.name || '-')}</td>
                <td style="text-transform:capitalize;font-weight:700;">${escapeHtml(line.chargeType?.category || '-')}</td>
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
          ${hasMultiplePages ? Object.entries(pageTotalsByCurrency).map(([cur, t]) => `
            <tr style="background:#f8fafc;">
              <td colspan="10" style="text-align:right;font-weight:600;color:#475569;">Page ${pagination!.page} Subtotal (${escapeHtml(cur)})</td>
              <td style="text-align:right;font-weight:600;">${mmk(t.tax)}</td>
              <td style="text-align:right;font-weight:600;">${mmk(t.total)}</td>
            </tr>
          `).join('') : ''}
          ${Object.entries(grandTotalsByCurrency).map(([cur, t]) => `
            <tr class="summary-row">
              <td colspan="10" style="text-align:right;font-weight:700;">Grand Total — All ${totalCount.toLocaleString()} Invoices (${escapeHtml(cur)})</td>
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
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .report-brand {
      display: flex;
      align-items: stretch;
      gap: 12px;
    }
    .report-property-logo {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      flex-shrink: 0;
    }
    .report-property-logo-fallback {
      width: 44px;
      height: 44px;
      border-radius: 6px;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      flex-shrink: 0;
    }
    .report-title-group {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 44px;
    }
    .report-title { font-size: 20px; line-height: 24px; font-weight: 800; color: #0f172a; }
    .report-subtitle { font-size: 13px; line-height: 16px; font-weight: 600; color: #475569; }
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
      background: #059669;
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
    <div class="preview-toolbar-title">
      ${escapeHtml(reportTitle)} — Showing ${startRow.toLocaleString()}–${endRow.toLocaleString()} of ${totalCount.toLocaleString()} invoice${totalCount !== 1 ? 's' : ''}
    </div>
    <div class="preview-toolbar-actions">
      ${pagination ? `
        <div style="display:flex;align-items:center;gap:8px;margin-right:10px;background:rgba(255,255,255,0.08);padding:4px 10px;border-radius:6px;">
          <span style="font-size:12px;color:#cbd5e1;">Rows/Page:</span>
          <select id="rpt-page-size" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;padding:3px 6px;font-size:12px;cursor:pointer;">
            ${[100, 500, 1000].map((sz) => `<option value="${sz}" ${pagination.pageSize === sz ? 'selected' : ''}>${sz}</option>`).join('')}
          </select>
          <button id="rpt-prev-btn" class="preview-btn" style="padding:4px 10px;font-size:12px;background:#334155;color:#fff;${pagination.page <= 1 ? 'opacity:0.4;cursor:not-allowed;' : ''}" ${pagination.page <= 1 ? 'disabled' : ''}>
            ◀ Prev
          </button>
          <span style="font-size:12px;font-weight:600;color:#f8fafc;min-width:95px;text-align:center;">
            Page ${pagination.page.toLocaleString()} / ${Math.max(1, pagination.totalPages).toLocaleString()}
          </span>
          <button id="rpt-next-btn" class="preview-btn" style="padding:4px 10px;font-size:12px;background:#334155;color:#fff;${pagination.page >= pagination.totalPages ? 'opacity:0.4;cursor:not-allowed;' : ''}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>
            Next ▶
          </button>
        </div>
      ` : ''}
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
        <div class="report-brand">
          ${reportPropertyLogoUrl ? `
            <img src="${escapeHtml(reportPropertyLogoUrl)}" alt="${escapeHtml(firstProp?.name || 'Property')}" class="report-property-logo" />
          ` : `
            <div class="report-property-logo-fallback">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                <path d="M9 22v-4h6v4"></path>
                <path d="M8 6h.01"></path>
                <path d="M16 6h.01"></path>
                <path d="M8 10h.01"></path>
                <path d="M16 10h.01"></path>
                <path d="M8 14h.01"></path>
                <path d="M16 14h.01"></path>
              </svg>
            </div>
          `}
          <div class="report-title-group">
            <div class="report-title">${escapeHtml(reportTitle)}</div>
            <div class="report-subtitle">${escapeHtml(firstProp?.name || 'All Properties')}</div>
          </div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
          <div><strong>Total Matched Invoices:</strong> ${totalCount.toLocaleString()}</div>
          ${pagination ? `<div><strong>Page:</strong> ${pagination.page.toLocaleString()} of ${Math.max(1, pagination.totalPages).toLocaleString()} (${startRow.toLocaleString()}–${endRow.toLocaleString()})</div>` : ''}
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
  bindPaginationEvents(win, pagination);
  win.focus();
  return true;
}

