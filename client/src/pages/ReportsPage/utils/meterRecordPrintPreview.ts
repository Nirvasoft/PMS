import type { MeterRecordReportRow } from '../../../store/api/meterRecordsApi';

export type MeterRecordReportType = 'detail' | 'summary';

export interface MeterRecordReportFiltersMeta {
  propertyName?: string;
  showPropertyColumn?: boolean;
  billDateFrom?: string;
  billDateTo?: string;
  startDateFrom?: string;
  endDateTo?: string;
  floor?: string;
  unitNumber?: string;
  tenantLabel?: string;
  meterType?: string;
  category?: string;
  meterNo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(dStr?: string | null): string {
  if (!dStr) return '—';
  const match = String(dStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return String(dStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtQty(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRate(n: number): string {
  const hasMoreDecimals = Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: hasMoreDecimals ? 4 : 2,
  });
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function openMeterRecordReportPreview(
  records: MeterRecordReportRow[],
  reportType: MeterRecordReportType,
  meta: MeterRecordReportFiltersMeta,
): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;

  const uniqueProps = Array.from(
    new Set(records.map((r) => r.propertyName).filter(Boolean)),
  );
  const showPropCol = Boolean(meta.showPropertyColumn || uniqueProps.length > 1);
  const subtitleProp =
    meta.propertyName ||
    (uniqueProps.length === 1 ? uniqueProps[0] : uniqueProps.length > 1 ? 'All Properties' : 'All Properties');

  const currencies = Array.from(new Set(records.map((r) => r.currency || 'MMK')));
  const singleCurrency = currencies.length === 1 ? currencies[0] : '';

  const grandTotalUnit = records.reduce((s, r) => s + r.totalUnit, 0);
  const grandTotalAmount = records.reduce((s, r) => s + r.amount, 0);

  const reportTitle =
    reportType === 'summary'
      ? 'Meter Record Summary Report'
      : 'Meter Record Detail Report';

  const now = new Date();
  const generatedAt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const filterBadges: string[] = [
    `Report: ${reportType === 'summary' ? 'Summary (Unit & Meter Type)' : 'Detail'}`,
  ];
  if (meta.billDateFrom || meta.billDateTo) {
    filterBadges.push(
      `Bill Date: ${meta.billDateFrom ? fmtDate(meta.billDateFrom) : 'Any'} – ${meta.billDateTo ? fmtDate(meta.billDateTo) : 'Any'}`,
    );
  }
  if (meta.startDateFrom || meta.endDateTo) {
    filterBadges.push(
      `Period: ${meta.startDateFrom ? fmtDate(meta.startDateFrom) : 'Any'} – ${meta.endDateTo ? fmtDate(meta.endDateTo) : 'Any'}`,
    );
  }
  if (meta.floor) filterBadges.push(`Floor: ${meta.floor}`);
  if (meta.unitNumber) filterBadges.push(`Unit: ${meta.unitNumber}`);
  if (meta.tenantLabel) filterBadges.push(`Tenant: ${meta.tenantLabel}`);
  if (meta.meterType) filterBadges.push(`Meter Type: ${meta.meterType}`);
  if (meta.category) filterBadges.push(`Category: ${meta.category}`);
  if (meta.meterNo) filterBadges.push(`Meter No: ${meta.meterNo}`);

  let tableHtml = '';

  if (reportType === 'detail') {
    const colCountBeforeTotals = showPropCol ? 10 : 9;
    const rowsHtml = records
      .map((r, idx) => {
        const periodStr = `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`;
        return `
          <tr>
            <td class="num center">${idx + 1}</td>
            <td class="nowrap">${escapeHtml(fmtDate(r.billDate))}</td>
            ${showPropCol ? `<td>${escapeHtml(r.propertyName || '—')}</td>` : ''}
            <td>${escapeHtml(r.floor || '—')}</td>
            <td class="nowrap"><strong>${escapeHtml(r.unitNumber || '—')}</strong></td>
            <td class="nowrap"><strong>${escapeHtml(r.tenantCode || '—')}</strong></td>
            <td>${escapeHtml(r.tenantName || '—')}</td>
            <td class="nowrap"><strong>${escapeHtml(r.meterNo)}</strong></td>
            <td class="nowrap">${escapeHtml(r.meterType || '—')}</td>
            <td class="nowrap">${escapeHtml(r.category || '—')}</td>
            <td class="num"><strong>${escapeHtml(fmtQty(r.totalUnit))}</strong></td>
            <td class="num">${escapeHtml(fmtRate(r.rate))}</td>
            <td class="num"><strong>${escapeHtml(fmtMoney(r.amount))}</strong></td>
            <td class="nowrap">${escapeHtml(periodStr)}</td>
          </tr>
        `;
      })
      .join('');

    tableHtml = `
      <table class="report-table">
        <thead>
          <tr>
            <th class="center" style="width:32px;">No.</th>
            <th>Bill Date</th>
            ${showPropCol ? '<th>Property</th>' : ''}
            <th>Floor</th>
            <th>Unit</th>
            <th>Tenant Code</th>
            <th>Tenant Name</th>
            <th>Meter No</th>
            <th>Meter Type</th>
            <th>Category</th>
            <th class="num">Total Unit</th>
            <th class="num">Rate</th>
            <th class="num">Amount${singleCurrency ? ` (${escapeHtml(singleCurrency)})` : ''}</th>
            <th>Period</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="summary-row">
            <td colspan="${colCountBeforeTotals}" class="num"><strong>Grand Total (${records.length.toLocaleString()} Record${records.length !== 1 ? 's' : ''})</strong></td>
            <td class="num"><strong>${escapeHtml(fmtQty(grandTotalUnit))}</strong></td>
            <td class="num">—</td>
            <td class="num"><strong>${escapeHtml(fmtMoney(grandTotalAmount))}${singleCurrency ? ` ${escapeHtml(singleCurrency)}` : ''}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;
  } else {
    // Summary: Group by Unit + Meter No + Meter Type + Category
    interface UnitMeterSummary {
      key: string;
      propertyName: string;
      floor: string;
      unitNumber: string;
      tenantCode: string;
      tenantName: string;
      meterNo: string;
      meterType: string;
      category: string;
      currency: string;
      recordCount: number;
      totalUnit: number;
      totalAmount: number;
    }

    const unitGroupMap = new Map<string, UnitMeterSummary>();
    const typeGroupMap = new Map<
      string,
      { meterType: string; category: string; recordCount: number; totalUnit: number; totalAmount: number }
    >();

    for (const r of records) {
      const key = `${r.propertyId}||${r.unitNumber}||${r.meterNo}||${r.meterType}||${r.category}`;
      const existing = unitGroupMap.get(key);
      if (existing) {
        existing.recordCount += 1;
        existing.totalUnit += r.totalUnit;
        existing.totalAmount += r.amount;
        if (!existing.tenantCode && r.tenantCode) {
          existing.tenantCode = r.tenantCode;
          existing.tenantName = r.tenantName;
        }
      } else {
        unitGroupMap.set(key, {
          key,
          propertyName: r.propertyName,
          floor: r.floor,
          unitNumber: r.unitNumber,
          tenantCode: r.tenantCode,
          tenantName: r.tenantName,
          meterNo: r.meterNo,
          meterType: r.meterType,
          category: r.category,
          currency: r.currency,
          recordCount: 1,
          totalUnit: r.totalUnit,
          totalAmount: r.amount,
        });
      }

      const typeKey = `${r.meterType || '—'}||${r.category || '—'}`;
      const typeExisting = typeGroupMap.get(typeKey);
      if (typeExisting) {
        typeExisting.recordCount += 1;
        typeExisting.totalUnit += r.totalUnit;
        typeExisting.totalAmount += r.amount;
      } else {
        typeGroupMap.set(typeKey, {
          meterType: r.meterType || '—',
          category: r.category || '—',
          recordCount: 1,
          totalUnit: r.totalUnit,
          totalAmount: r.amount,
        });
      }
    }

    const summaryRows = Array.from(unitGroupMap.values());
    if (meta.sortBy === 'totalUnit' || meta.sortBy === 'amount') {
      const dir = meta.sortOrder === 'desc' ? -1 : 1;
      summaryRows.sort((a, b) =>
        meta.sortBy === 'totalUnit'
          ? (a.totalUnit - b.totalUnit) * dir
          : (a.totalAmount - b.totalAmount) * dir,
      );
    }
    const typeBreakdownRows = Array.from(typeGroupMap.values()).sort(
      (a, b) => a.meterType.localeCompare(b.meterType) || a.category.localeCompare(b.category),
    );

    const colCountBeforeRecords = showPropCol ? 9 : 8;

    const unitSummaryHtml = summaryRows
      .map((g, idx) => {
        const avgRate = g.totalUnit > 0 ? g.totalAmount / g.totalUnit : 0;
        return `
          <tr>
            <td class="num center">${idx + 1}</td>
            ${showPropCol ? `<td>${escapeHtml(g.propertyName || '—')}</td>` : ''}
            <td>${escapeHtml(g.floor || '—')}</td>
            <td class="nowrap"><strong>${escapeHtml(g.unitNumber || '—')}</strong></td>
            <td class="nowrap"><strong>${escapeHtml(g.tenantCode || '—')}</strong></td>
            <td>${escapeHtml(g.tenantName || '—')}</td>
            <td class="nowrap"><strong>${escapeHtml(g.meterNo)}</strong></td>
            <td class="nowrap">${escapeHtml(g.meterType || '—')}</td>
            <td class="nowrap">${escapeHtml(g.category || '—')}</td>
            <td class="num center">${g.recordCount}</td>
            <td class="num"><strong>${escapeHtml(fmtQty(g.totalUnit))}</strong></td>
            <td class="num">${escapeHtml(fmtRate(avgRate))}</td>
            <td class="num"><strong>${escapeHtml(fmtMoney(g.totalAmount))}</strong></td>
          </tr>
        `;
      })
      .join('');

    const typeBreakdownHtml = typeBreakdownRows
      .map(
        (t, idx) => `
          <tr>
            <td class="num center">${idx + 1}</td>
            <td><strong>${escapeHtml(t.meterType)}</strong></td>
            <td>${escapeHtml(t.category)}</td>
            <td class="num center">${t.recordCount.toLocaleString()}</td>
            <td class="num"><strong>${escapeHtml(fmtQty(t.totalUnit))}</strong></td>
            <td class="num"><strong>${escapeHtml(fmtMoney(t.totalAmount))}</strong></td>
          </tr>
        `,
      )
      .join('');

    tableHtml = `
      <div class="section-heading">Summary by Unit &amp; Meter</div>
      <table class="report-table">
        <thead>
          <tr>
            <th class="center" style="width:32px;">No.</th>
            ${showPropCol ? '<th>Property</th>' : ''}
            <th>Floor</th>
            <th>Unit</th>
            <th>Tenant Code</th>
            <th>Tenant Name</th>
            <th>Meter No</th>
            <th>Meter Type</th>
            <th>Category</th>
            <th class="center">Records</th>
            <th class="num">Total Unit</th>
            <th class="num">Avg Rate</th>
            <th class="num">Total Amount${singleCurrency ? ` (${escapeHtml(singleCurrency)})` : ''}</th>
          </tr>
        </thead>
        <tbody>
          ${unitSummaryHtml}
          <tr class="summary-row">
            <td colspan="${colCountBeforeRecords}" class="num"><strong>Grand Total (${summaryRows.length.toLocaleString()} Meter Group${summaryRows.length !== 1 ? 's' : ''})</strong></td>
            <td class="num center"><strong>${records.length.toLocaleString()}</strong></td>
            <td class="num"><strong>${escapeHtml(fmtQty(grandTotalUnit))}</strong></td>
            <td class="num">—</td>
            <td class="num"><strong>${escapeHtml(fmtMoney(grandTotalAmount))}${singleCurrency ? ` ${escapeHtml(singleCurrency)}` : ''}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="section-heading" style="margin-top: 18px;">Summary by Meter Type &amp; Category</div>
      <table class="report-table" style="max-width: 720px;">
        <thead>
          <tr>
            <th class="center" style="width:32px;">No.</th>
            <th>Meter Type</th>
            <th>Category</th>
            <th class="center">Records</th>
            <th class="num">Total Unit</th>
            <th class="num">Total Amount${singleCurrency ? ` (${escapeHtml(singleCurrency)})` : ''}</th>
          </tr>
        </thead>
        <tbody>
          ${typeBreakdownHtml}
          <tr class="summary-row">
            <td colspan="3" class="num"><strong>Grand Total</strong></td>
            <td class="num center"><strong>${records.length.toLocaleString()}</strong></td>
            <td class="num"><strong>${escapeHtml(fmtQty(grandTotalUnit))}</strong></td>
            <td class="num"><strong>${escapeHtml(fmtMoney(grandTotalAmount))}${singleCurrency ? ` ${escapeHtml(singleCurrency)}` : ''}</strong></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(reportTitle)} — ${escapeHtml(subtitleProp)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Myanmar:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #475569;
      font-family: 'Inter', 'Noto Sans Myanmar', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      color: #0f172a;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
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
    .report-title { font-size: 20px; line-height: 24px; font-weight: 800; color: #0f172a; }
    .report-subtitle { font-size: 13px; line-height: 16px; font-weight: 600; color: #475569; margin-top: 4px; }
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
    .section-heading {
      font-size: 12px;
      font-weight: 800;
      color: #065f46;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 8px;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .report-table th,
    .report-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 7px;
      vertical-align: middle;
    }
    .report-table thead th {
      background: #059669;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .report-table tbody tr:nth-child(even):not(.summary-row) { background: #f8fafc; }
    .report-table th.num,
    .report-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .report-table th.center,
    .report-table td.center { text-align: center; }
    .nowrap { white-space: nowrap; }
    .sub-cell { font-size: 9.5px; color: #475569; margin-top: 1px; }
    .summary-row td {
      background: #f1f5f9;
      border-top: 2px solid #0f172a;
      font-size: 11px;
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
      ${escapeHtml(reportTitle)} — ${records.length.toLocaleString()} Record${records.length !== 1 ? 's' : ''} • Total Unit: ${escapeHtml(fmtQty(grandTotalUnit))} • Total Amount: ${escapeHtml(fmtMoney(grandTotalAmount))}${singleCurrency ? ` ${escapeHtml(singleCurrency)}` : ''}
    </div>
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
          <div class="report-subtitle">${escapeHtml(subtitleProp)}</div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
          <div><strong>Total Records:</strong> ${records.length.toLocaleString()} &nbsp;|&nbsp; <strong>Total Unit:</strong> ${escapeHtml(fmtQty(grandTotalUnit))} &nbsp;|&nbsp; <strong>Total Amount:</strong> ${escapeHtml(fmtMoney(grandTotalAmount))}${singleCurrency ? ` ${escapeHtml(singleCurrency)}` : ''}</div>
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
  return true;
}
