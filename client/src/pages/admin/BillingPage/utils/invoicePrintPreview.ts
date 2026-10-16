import type { InvoiceDetail } from '../../../../store/api/billingApi';

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

export function generateInvoiceHtml(inv: InvoiceDetail): string {
  const invoiceNo = inv.invoiceNumber || '-';
  const displayCurrency = inv.currency || 'USD';

  const tenantName = inv.tenant.tenantType === 'company'
    ? (inv.tenant.companyName || '')
    : [inv.tenant.firstName, inv.tenant.lastName].filter(Boolean).join(' - ') || '-';

  // Group lines by chargeType.category (matching server pdf.service.ts)
  const categoryMap = new Map<string, typeof inv.lines>();
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

  return `<!doctype html>
<html lang="my">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice - ${escapeHtml(invoiceNo)}</title>
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

    /* ── Preview Toolbar (no-print) ── */
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 10px 24px;
      background: #1e293b;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
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

    /* ── A4 Preview Container & Paper Sheet ── */
    .preview-container {
      padding: 24px 16px;
      display: flex;
      justify-content: center;
      min-height: calc(100vh - 49px);
    }

    /* Exact A4 Portrait Dimensions (210mm x 297mm) */
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
    }

    /* ── Page Header ── */
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

    /* ── Info Section ── */
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

    /* ── Items Table ── */
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
    .col-no   { width: 34px;  text-align: center; }
    .col-img  { width: 34px;  text-align: center; }
    .col-desc { text-align: left; }
    .col-sqft { width: 88px;  text-align: center; }
    .col-rate { width: 82px;  text-align: right;  }
    .col-qty  { width: 70px;  text-align: right;  }
    .col-amt  { width: 105px; text-align: right;  }

    /* Row styles */
    .row-group td { font-weight: 400; }
    .row-sub   td { font-weight: 400; }
    .row-grand td { font-weight: 700; font-size: 12px; background: #fff; }

    /* Utility */
    .ta-right  { text-align: right  !important; }
    .ta-center { text-align: center !important; }
    .pl-14     { padding-left: 14px !important; }

    /* ── Footer ── */
    .footer-wrap {
      margin-top: 18px;
      font-size: 11.5px;
    }
    .footer-note { margin-bottom: 6px; line-height: 1.6; }
    .footer-hours { margin-top: 8px; display: flex; align-items: baseline; gap: 12px; }
    .footer-hours .label { white-space: nowrap; }
    .footer-hours .time  { font-weight: 600; }

    /* ── Exact A4 Print Configuration ── */
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    @media print {
      html, body {
        background: #fff !important;
        width: 210mm;
        height: 297mm;
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
    <div class="invoice-paper">
      <!-- ════ PAGE HEADER ════ -->
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

      <!-- ════ INFO SECTION ════ -->
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
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr class="row-grand">
            <td colspan="6" class="ta-right" style="padding-right:10px;">Grand Total (${escapeHtml(displayCurrency)})</td>
            <td class="col-amt ta-right">${mmk(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- ════ FOOTER NOTES ════ -->
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
