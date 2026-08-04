/**
 * Report Export Service — generates Excel (xlsx) and CSV exports
 * from dashboard widget data.
 */
import ExcelJS from 'exceljs';
import { getRealWidgetData } from './widgets/realProvider';
import { AppError } from '../../common/errors';

interface ExportParams {
  companyId: string;
  propertyId?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
}

interface ReportColumn {
  header: string;
  key: string;
  width?: number;
}

interface ReportRow {
  [key: string]: string | number | null;
}

/**
 * Convert widget data into a tabular format (columns + rows)
 */
function widgetDataToTable(widgetCode: string, data: Record<string, unknown>): {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: ReportRow;
} {
  const label = (data.label as string) || widgetCode.replace(/_/g, ' ');

  // KPI card
  if (data.type === 'kpi_card') {
    const columns: ReportColumn[] = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    const rows: ReportRow[] = [
      { metric: label, value: `${data.value}${data.unit || ''}` },
    ];
    // Add breakdown
    if (data.breakdown && typeof data.breakdown === 'object') {
      for (const [k, v] of Object.entries(data.breakdown as Record<string, number>)) {
        rows.push({ metric: k.replace(/_/g, ' '), value: v });
      }
    }
    // Trend
    const trend = data.trend as Record<string, unknown> | undefined;
    if (trend) {
      rows.push({
        metric: `Trend (${trend.label || ''})`,
        value: `${trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}${trend.changePercent}%`,
      });
    }
    return { title: label, columns, rows };
  }

  // Line chart / Bar chart
  if ((data.type === 'line_chart' || data.type === 'bar_chart') && data.series) {
    const series = (data.series as Array<{ name: string; data: Array<{ x: string; y: number }> }>);
    if (series.length === 0) return { title: label, columns: [], rows: [] };

    const columns: ReportColumn[] = [
      { header: data.type === 'line_chart' ? 'Period' : 'Category', key: 'x', width: 20 },
      ...series.map((s) => ({ header: s.name, key: s.name, width: 18 })),
    ];

    // Merge all x-axis points
    const xValues = [...new Set(series.flatMap((s) => s.data.map((d) => d.x)))];
    const rows: ReportRow[] = xValues.map((x) => {
      const row: ReportRow = { x };
      for (const s of series) {
        const point = s.data.find((d) => d.x === x);
        row[s.name] = point?.y ?? null;
      }
      return row;
    });

    // Summary row — totals
    const summary: ReportRow = { x: 'Total' };
    for (const s of series) {
      summary[s.name] = s.data.reduce((sum, d) => sum + d.y, 0);
    }

    return { title: label, columns, rows, summary };
  }

  // Pie chart
  if (data.type === 'pie_chart' && data.data) {
    const pieData = data.data as Array<{ name: string; value: number }>;
    const total = pieData.reduce((s, d) => s + d.value, 0);
    const columns: ReportColumn[] = [
      { header: 'Category', key: 'name', width: 25 },
      { header: 'Value', key: 'value', width: 15 },
      { header: 'Percentage', key: 'pct', width: 15 },
    ];
    const rows: ReportRow[] = pieData.map((d) => ({
      name: d.name,
      value: d.value,
      pct: total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '0%',
    }));
    return { title: label, columns, rows, summary: { name: 'Total', value: total, pct: '100%' } };
  }

  // Gauge
  if (data.type === 'gauge') {
    const columns: ReportColumn[] = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    const rows: ReportRow[] = [
      { metric: label, value: `${data.value}${data.unit || ''}` },
    ];
    if (data.breakdown && typeof data.breakdown === 'object') {
      for (const [k, v] of Object.entries(data.breakdown as Record<string, number>)) {
        rows.push({ metric: k.replace(/_/g, ' '), value: v });
      }
    }
    return { title: label, columns, rows };
  }

  // Data table
  if (data.type === 'data_table' && data.columns && data.rows) {
    const cols = data.columns as string[];
    const columns: ReportColumn[] = cols.map((c) => ({
      header: c,
      key: c.toLowerCase().replace(/\s+/g, '_'),
      width: Math.max(15, c.length + 5),
    }));
    const rows: ReportRow[] = (data.rows as string[][]).map((row) => {
      const obj: ReportRow = {};
      cols.forEach((c, i) => {
        obj[c.toLowerCase().replace(/\s+/g, '_')] = row[i] ?? '';
      });
      return obj;
    });
    return { title: label, columns, rows };
  }

  // Fallback
  return {
    title: label,
    columns: [{ header: 'Field', key: 'field', width: 20 }, { header: 'Value', key: 'value', width: 30 }],
    rows: Object.entries(data)
      .filter(([k]) => !['type', 'updatedAt'].includes(k))
      .map(([k, v]) => ({ field: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) })),
  };
}

/**
 * Export widget data as Excel (xlsx)
 */
export async function exportToExcel(
  widgetCode: string,
  params: ExportParams,
): Promise<{ buffer: Buffer; filename: string }> {
  const rawData = await getRealWidgetData(widgetCode, params);
  const { title, columns, rows, summary } = widgetDataToTable(widgetCode, rawData as Record<string, unknown>);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NirvaSoft PMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title.slice(0, 31)); // Excel limits sheet name to 31 chars

  // Title row
  sheet.mergeCells(1, 1, 1, columns.length || 1);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1A3C5E' } };
  titleCell.alignment = { horizontal: 'left' };
  sheet.getRow(1).height = 28;

  // Date range row
  if (params.dateFrom && params.dateTo) {
    sheet.mergeCells(2, 1, 2, columns.length || 1);
    const dateCell = sheet.getCell('A2');
    dateCell.value = `Period: ${params.dateFrom} to ${params.dateTo}`;
    dateCell.font = { size: 10, color: { argb: 'FF777777' } };
  }

  // Header row
  const headerRowNum = params.dateFrom ? 4 : 3;
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || 15,
  }));

  // Re-apply headers on correct row
  const headerRow = sheet.getRow(headerRowNum);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A3C5E' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
    cell.alignment = { vertical: 'middle' };
  });

  // Data rows
  rows.forEach((row) => {
    const dataRow = sheet.addRow(
      columns.map((c) => row[c.key] ?? ''),
    );
    dataRow.eachCell((cell) => {
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } },
      };
    });
  });

  // Summary row
  if (summary) {
    sheet.addRow([]);
    const sumRow = sheet.addRow(columns.map((c) => summary[c.key] ?? ''));
    sumRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' },
      };
    });
  }

  const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filename = `${safeTitle}_${params.dateFrom || 'report'}.xlsx`;

  return { buffer, filename };
}

/**
 * Export widget data as CSV
 */
export async function exportToCsv(
  widgetCode: string,
  params: ExportParams,
): Promise<{ content: string; filename: string }> {
  const rawData = await getRealWidgetData(widgetCode, params);
  const { title, columns, rows, summary } = widgetDataToTable(widgetCode, rawData as Record<string, unknown>);

  const lines: string[] = [];

  // Header
  lines.push(columns.map((c) => `"${c.header}"`).join(','));

  // Rows
  for (const row of rows) {
    const cells = columns.map((c) => {
      const val = row[c.key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'number') return String(val);
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    lines.push(cells.join(','));
  }

  // Summary
  if (summary) {
    const sumCells = columns.map((c) => {
      const val = summary[c.key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'number') return String(val);
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    lines.push(sumCells.join(','));
  }

  const content = lines.join('\n');
  const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filename = `${safeTitle}_${params.dateFrom || 'report'}.csv`;

  return { content, filename };
}
