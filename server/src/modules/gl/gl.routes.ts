import { Router, Request } from 'express';
import ExcelJS from 'exceljs';
import { asyncHandler } from '../../middleware';
import { validateRequest } from '../../middleware/validateRequest';
import { glService } from './gl.service';
import {
  createAccountSchema, updateAccountSchema,
  createDepartmentCenterSchema, updateDepartmentCenterSchema,
  createCostCenterSchema, updateCostCenterSchema,
  createPaymentMethodSchema, updatePaymentMethodSchema,
  createFiscalPeriodSchema,
  createJournalEntrySchema,
} from './gl.schema';
import { assertV6ErpNotActive } from '../integrations/v6Status.helper';

const p = (req: Request, key: string) => req.params[key] as string;
const q = (req: Request, key: string) => (req.query[key] as string) || '';

// ════════════════════════════════════════════════
// CHART OF ACCOUNTS — /api/v1/gl/accounts
// ════════════════════════════════════════════════
export const glRouter = Router();

glRouter.get('/accounts', asyncHandler(async (req, res) => {
  const data = await glService.getAccounts(req.user!.companyId, {
    propertyId: q(req, 'propertyId') || undefined,
    accountType: q(req, 'accountType') || undefined,
    tree: req.query.tree === 'true',
  });
  res.json({ success: true, data });
}));

glRouter.post('/accounts', validateRequest(createAccountSchema), asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'GL account');
  const data = await glService.createAccount(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/accounts/:id', validateRequest(updateAccountSchema), asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'GL account update');
  const data = await glService.updateAccount(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// DEPARTMENT CENTERS — /api/v1/gl/department-centers
// ════════════════════════════════════════════════

glRouter.get('/department-centers', asyncHandler(async (req, res) => {
  const isActiveParam = q(req, 'isActive');
  const data = await glService.getDepartmentCenters(req.user!.companyId, {
    propertyId: q(req, 'propertyId') || undefined,
    isActive: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
    search: q(req, 'search') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.post('/department-centers', validateRequest(createDepartmentCenterSchema), asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'Department');
  const data = await glService.createDepartmentCenter(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/department-centers/:id', validateRequest(updateDepartmentCenterSchema), asyncHandler(async (req, res) => {
  const data = await glService.updateDepartmentCenter(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

glRouter.delete('/department-centers/:id', asyncHandler(async (req, res) => {
  const data = await glService.deleteDepartmentCenter(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// COST CENTERS — /api/v1/gl/cost-centers
// ════════════════════════════════════════════════

glRouter.get('/cost-centers', asyncHandler(async (req, res) => {
  const isActiveParam = q(req, 'isActive');
  const data = await glService.getCostCenters(req.user!.companyId, {
    propertyId: q(req, 'propertyId') || undefined,
    isActive: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
    departmentCenterId: q(req, 'departmentCenterId') || undefined,
    search: q(req, 'search') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.post('/cost-centers', validateRequest(createCostCenterSchema), asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'Cost center');
  const data = await glService.createCostCenter(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/cost-centers/:id', validateRequest(updateCostCenterSchema), asyncHandler(async (req, res) => {
  const data = await glService.updateCostCenter(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

glRouter.delete('/cost-centers/:id', asyncHandler(async (req, res) => {
  const data = await glService.deleteCostCenter(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// PAYMENT METHODS — /api/v1/gl/payment-methods
// ════════════════════════════════════════════════

glRouter.get('/payment-methods', asyncHandler(async (req, res) => {
  const isActiveParam = q(req, 'isActive');
  const data = await glService.getPaymentMethods(req.user!.companyId, {
    propertyId: q(req, 'propertyId') || undefined,
    isActive: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
    search: q(req, 'search') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.post('/payment-methods', validateRequest(createPaymentMethodSchema), asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'Payment method');
  const data = await glService.createPaymentMethod(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/payment-methods/:id', validateRequest(updatePaymentMethodSchema), asyncHandler(async (req, res) => {
  const data = await glService.updatePaymentMethod(p(req, 'id'), req.user!.companyId, req.body);
  res.json({ success: true, data });
}));

glRouter.delete('/payment-methods/:id', asyncHandler(async (req, res) => {
  const data = await glService.deletePaymentMethod(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// FISCAL PERIODS — /api/v1/gl/fiscal-periods
// ════════════════════════════════════════════════

glRouter.get('/fiscal-periods', asyncHandler(async (req, res) => {
  const data = await glService.getFiscalPeriods(req.user!.companyId);
  res.json({ success: true, data });
}));

glRouter.post('/fiscal-periods', validateRequest(createFiscalPeriodSchema), asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'Fiscal period');
  const data = await glService.createFiscalPeriod(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.post('/fiscal-periods/generate', asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'Fiscal period');
  const year = parseInt(req.body.year);
  if (!year || year < 2020 || year > 2099) throw new Error('Invalid year (2020-2099)');
  const data = await glService.generateFiscalYear(req.user!.companyId, year);
  res.json({ success: true, data });
}));

glRouter.post('/fiscal-periods/:id/close', asyncHandler(async (req, res) => {
  const data = await glService.closeFiscalPeriod(p(req, 'id'), req.user!.sub);
  res.json({ success: true, data });
}));

glRouter.post('/fiscal-periods/:id/reopen', asyncHandler(async (req, res) => {
  const data = await glService.reopenFiscalPeriod(p(req, 'id'));
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// JOURNAL ENTRIES — /api/v1/gl/journal-entries
// ════════════════════════════════════════════════

glRouter.get('/journal-entries', asyncHandler(async (req, res) => {
  const result = await glService.getJournalEntries(req.user!.companyId, req.query);
  res.json({ success: true, ...result });
}));

glRouter.get('/journal-entries/:id', asyncHandler(async (req, res) => {
  const data = await glService.getJournalEntry(p(req, 'id'), req.user!.companyId);
  res.json({ success: true, data });
}));

glRouter.post('/journal-entries', validateRequest(createJournalEntrySchema), asyncHandler(async (req, res) => {
  await assertV6ErpNotActive(req.user!.companyId, 'Journal entry');
  const data = await glService.createJournalEntry(req.user!.companyId, req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.post('/journal-entries/:id/post', asyncHandler(async (req, res) => {
  const data = await glService.postJournalEntry(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

glRouter.post('/journal-entries/:id/reverse', asyncHandler(async (req, res) => {
  const data = await glService.reverseJournalEntry(p(req, 'id'), req.user!.companyId, req.user!.sub);
  res.json({ success: true, data });
}));

// ════════════════════════════════════════════════
// REPORTS — /api/v1/gl/trial-balance, /gl/reports/*
// ════════════════════════════════════════════════

interface GlExcelColumn {
  key: string;
  header: string;
  width: number;
  numeric?: boolean;
}

function createStyledGlSheet(title: string, subtitle: string, columns: GlExcelColumn[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NirvaSoft PMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title);
  sheet.columns = columns.map(c => ({ key: c.key, width: c.width }));

  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF059669' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, columns.length);
  const subCell = sheet.getCell('A2');
  subCell.value = subtitle;
  subCell.font = { size: 10, color: { argb: 'FF555555' } };
  sheet.getRow(2).height = 18;

  const headerRow = sheet.getRow(4);
  headerRow.height = 22;
  columns.forEach((c, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = c.header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = {
      vertical: 'middle',
      horizontal: c.numeric ? 'right' : 'left',
      wrapText: false,
    };
  });

  return { workbook, sheet };
}

function addGlDataRow(sheet: ExcelJS.Worksheet, values: Array<string | number>, numericStartCol: number) {
  const row = sheet.addRow(values);
  row.eachCell((cell, colNum) => {
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } } };
    if (colNum >= numericStartCol) {
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
    } else {
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
    }
  });
}

function addGlSummaryRow(
  sheet: ExcelJS.Worksheet,
  values: Array<string | number>,
  numericStartCol: number,
  isHighlight = false,
) {
  const row = sheet.addRow(values);
  row.height = 21;
  row.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isHighlight ? 'FFECFDF5' : 'FFF1F5F9' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
    if (colNum >= numericStartCol) {
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
    } else {
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
    }
  });
}

async function sendExcelWorkbook(res: any, workbook: ExcelJS.Workbook, filename: string) {
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

glRouter.get('/trial-balance', asyncHandler(async (req, res) => {
  const fromDate = q(req, 'fromDate') || undefined;
  const toDate = q(req, 'toDate') || undefined;
  const data = await glService.getTrialBalance(req.user!.companyId, {
    fromDate,
    toDate,
    propertyId: q(req, 'propertyId') || undefined,
  });

  if (req.query.format === 'xlsx') {
    const periodText = fromDate || toDate ? `Period: ${fromDate || 'Start'} to ${toDate || 'Current'}` : 'Period: All Time';
    const { workbook, sheet } = createStyledGlSheet(
      'Trial Balance',
      `${periodText}   |   Status: ${data.summary.isBalanced ? 'Balanced' : 'Unbalanced'}`,
      [
        { key: 'code', header: 'Code', width: 14 },
        { key: 'name', header: 'Account Name', width: 34 },
        { key: 'accountType', header: 'Type', width: 16 },
        { key: 'accountSubtype', header: 'Subtype', width: 20 },
        { key: 'totalDebit', header: 'Debit', width: 18, numeric: true },
        { key: 'totalCredit', header: 'Credit', width: 18, numeric: true },
        { key: 'netBalance', header: 'Net Balance', width: 18, numeric: true },
      ],
    );

    for (const r of data.rows) {
      addGlDataRow(
        sheet,
        [
          r.code,
          r.name,
          r.accountType,
          r.accountSubtype || '',
          Number(r.totalDebit || 0),
          Number(r.totalCredit || 0),
          Number(r.netBalance || 0),
        ],
        5,
      );
    }

    addGlSummaryRow(
      sheet,
      [
        '',
        'TOTALS',
        '',
        data.summary.isBalanced ? 'Balanced' : 'Unbalanced',
        Number(data.summary.totalDebit || 0),
        Number(data.summary.totalCredit || 0),
        Number((data.summary.totalDebit || 0) - (data.summary.totalCredit || 0)),
      ],
      5,
    );

    return sendExcelWorkbook(res, workbook, `trial-balance-${toDate || 'current'}.xlsx`);
  }

  if (req.query.format === 'csv') {
    const esc = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const header = 'Code,Account Name,Type,Subtype,Total Debit,Total Credit,Net Balance\n';
    const rows = data.rows.map(r =>
      `${esc(r.code)},${esc(r.name)},${esc(r.accountType)},${esc(r.accountSubtype || '')},${r.totalDebit.toFixed(2)},${r.totalCredit.toFixed(2)},${r.netBalance.toFixed(2)}`
    ).join('\n');
    const netDiff = (data.summary.totalDebit - data.summary.totalCredit).toFixed(2);
    const totals = `\n"","TOTALS","","",${data.summary.totalDebit.toFixed(2)},${data.summary.totalCredit.toFixed(2)},${netDiff}`;
    const balanced = `\n"","Balanced: ${data.summary.isBalanced ? 'YES' : 'NO'}","","","","",""`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trial-balance-${toDate || 'current'}.csv"`);
    return res.send('\uFEFF' + header + rows + totals + balanced);
  }

  res.json({ success: true, data });
}));

glRouter.get('/detailed-trial-balance', asyncHandler(async (req, res) => {
  const fiscalYearRaw = q(req, 'fiscalYear');
  const data = await glService.getDetailedTrialBalance(req.user!.companyId, {
    mode: q(req, 'mode') === 'date' ? 'date' : 'period',
    fiscalYear: fiscalYearRaw ? parseInt(fiscalYearRaw, 10) : undefined,
    periodFrom: q(req, 'periodFrom') || undefined,
    periodTo: q(req, 'periodTo') || undefined,
    fromDate: q(req, 'fromDate') || undefined,
    toDate: q(req, 'toDate') || undefined,
    category: q(req, 'category') || undefined,
    includeZero: q(req, 'includeZero') === 'true',
    allAccounts: q(req, 'allAccounts') !== 'false',
    accountFrom: q(req, 'accountFrom') || undefined,
    accountTo: q(req, 'accountTo') || undefined,
    costCenterId: q(req, 'costCenterId') || undefined,
    departmentCenterId: q(req, 'departmentCenterId') || undefined,
    propertyId: q(req, 'propertyId') || undefined,
  });

  if (req.query.format === 'xlsx') {
    const mapEntryMode = (entryType: string) => {
      const map: Record<string, string> = {
        ar_invoice: 'SI',
        ar_receipt: 'CBR',
        ap_invoice: 'PI',
        ap_payment: 'CBP',
        manual: 'JV',
        adjustment: 'ADJ',
        depreciation: 'DEP',
        bank_recon: 'BR',
      };
      return map[entryType] || (entryType || 'JV').toUpperCase().slice(0, 4);
    };

    const fmtDmy = (iso: string) => {
      const d = iso.split('T')[0].split('-');
      return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
    };

    const { workbook, sheet } = createStyledGlSheet(
      'Detailed Trial',
      `Date : ${data.periodLabel}   |   All Amount in MMK`,
      [
        { key: 'accCode', header: 'Acc. Code', width: 14 },
        { key: 'accDesc', header: 'Acc. Description', width: 28 },
        { key: 'refNo', header: 'Ref.#', width: 16 },
        { key: 'mode', header: 'Mode', width: 10 },
        { key: 'date', header: 'Date', width: 14 },
        { key: 'description', header: 'Description', width: 34 },
        { key: 'department', header: 'Department', width: 14 },
        { key: 'cc', header: 'CC', width: 14 },
        { key: 'curr', header: 'Curr.', width: 10 },
        { key: 'rate', header: 'Rate', width: 10, numeric: true },
        { key: 'amount', header: 'Amount', width: 16, numeric: true },
        { key: 'debit', header: 'Debit', width: 16, numeric: true },
        { key: 'credit', header: 'Credit', width: 16, numeric: true },
        { key: 'balance', header: 'Balance', width: 16, numeric: true },
      ],
    );

    for (const acc of data.accounts) {
      if (Math.abs(acc.openingDebit) >= 0.005 || Math.abs(acc.openingCredit) >= 0.005) {
        const netOpen = Number(acc.openingDebit || 0) - Number(acc.openingCredit || 0);
        addGlDataRow(
          sheet,
          [
            acc.code,
            acc.name,
            'OPENING',
            'OB',
            fmtDmy(data.effectiveFromDate),
            'Opening Balance',
            acc.department?.code || '-',
            acc.costCenter?.code || '-',
            'MMK',
            1.0,
            netOpen,
            Number(acc.openingDebit || 0),
            Number(acc.openingCredit || 0),
            '',
          ],
          10,
        );
      }

      for (const tx of acc.transactions) {
        const signedAmt = Number(tx.debit || 0) - Number(tx.credit || 0);
        addGlDataRow(
          sheet,
          [
            acc.code,
            acc.name,
            tx.journalNumber,
            mapEntryMode(tx.entryType),
            fmtDmy(tx.entryDate),
            tx.description || acc.name,
            tx.department?.code || '-',
            tx.costCenter?.code || '-',
            'MMK',
            1.0,
            signedAmt,
            Number(tx.debit || 0),
            Number(tx.credit || 0),
            '',
          ],
          10,
        );
      }

      const accTotalDebit = Number(acc.openingDebit || 0) + Number(acc.periodDebit || 0);
      const accTotalCredit = Number(acc.openingCredit || 0) + Number(acc.periodCredit || 0);
      const accNet = accTotalDebit - accTotalCredit;

      addGlSummaryRow(
        sheet,
        [
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          `Sub Total (${acc.code})`,
          '',
          '',
          accTotalDebit,
          accTotalCredit,
          accNet,
        ],
        12,
      );

      addGlSummaryRow(
        sheet,
        [
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          `Total (${acc.code})`,
          '',
          '',
          accTotalDebit,
          accTotalCredit,
          accNet,
        ],
        12,
      );
      sheet.addRow([]);
    }

    addGlSummaryRow(
      sheet,
      [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Grand Total',
        '',
        '',
        Number(data.summary.totalDebit || 0),
        Number(data.summary.totalCredit || 0),
        Number((data.summary.totalDebit || 0) - (data.summary.totalCredit || 0)),
      ],
      12,
      true,
    );

    return sendExcelWorkbook(res, workbook, `detailed-trial-balance-${data.effectiveToDate}.xlsx`);
  }

  res.json({ success: true, data });
}));

glRouter.get('/reports/pnl', asyncHandler(async (req, res) => {
  const data = await glService.getProfitAndLoss(req.user!.companyId, {
    fromDate: q(req, 'fromDate') || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    toDate: q(req, 'toDate') || new Date().toISOString().split('T')[0],
    propertyId: q(req, 'propertyId') || undefined,
    compareFromDate: q(req, 'compareFromDate') || undefined,
    compareToDate: q(req, 'compareToDate') || undefined,
  });
  res.json({ success: true, data });
}));

glRouter.get('/reports/balance-sheet', asyncHandler(async (req, res) => {
  const asOfDate = q(req, 'asOfDate') || new Date().toISOString().split('T')[0];
  const data = await glService.getBalanceSheet(req.user!.companyId, {
    asOfDate,
    propertyId: q(req, 'propertyId') || undefined,
  });

  if (req.query.format === 'xlsx') {
    const { workbook, sheet } = createStyledGlSheet(
      'Balance Sheet',
      `As of Date: ${asOfDate}   |   Status: ${data.isBalanced ? 'Balanced (A = L + E)' : 'Out of Balance'}`,
      [
        { key: 'code', header: 'Code', width: 14 },
        { key: 'name', header: 'Account Name', width: 38 },
        { key: 'section', header: 'Section', width: 18 },
        { key: 'accountSubtype', header: 'Subtype', width: 24 },
        { key: 'netBalance', header: 'Net Balance', width: 22, numeric: true },
      ],
    );

    for (const r of data.assets) {
      addGlDataRow(sheet, [r.code, r.name, 'Assets', r.accountSubtype || '', Number(r.netBalance || 0)], 5);
    }
    addGlSummaryRow(sheet, ['', 'Total Assets', '', '', Number(data.totalAssets || 0)], 5, true);
    sheet.addRow([]);

    for (const r of data.liabilities) {
      addGlDataRow(sheet, [r.code, r.name, 'Liabilities', r.accountSubtype || '', Number(r.netBalance || 0)], 5);
    }
    addGlSummaryRow(sheet, ['', 'Total Liabilities', '', '', Number(data.totalLiabilities || 0)], 5);
    sheet.addRow([]);

    for (const r of data.equity) {
      addGlDataRow(sheet, [r.code, r.name, 'Equity', r.accountSubtype || '', Number(r.netBalance || 0)], 5);
    }
    if (data.retainedEarnings !== 0) {
      addGlDataRow(sheet, ['', 'Retained Earnings (Current Period)', 'Equity', 'retained_earnings', Number(data.retainedEarnings || 0)], 5);
    }
    addGlSummaryRow(sheet, ['', 'Total Equity', '', '', Number(data.totalEquity || 0)], 5);
    sheet.addRow([]);

    addGlSummaryRow(sheet, ['', 'Total Liabilities + Equity', '', '', Number(data.totalLiabilitiesAndEquity || 0)], 5, true);

    return sendExcelWorkbook(res, workbook, `balance-sheet-${asOfDate}.xlsx`);
  }

  res.json({ success: true, data });
}));

glRouter.get('/reports/cash-flow', asyncHandler(async (req, res) => {
  const data = await glService.getCashFlow(req.user!.companyId, {
    fromDate: q(req, 'fromDate') || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    toDate: q(req, 'toDate') || new Date().toISOString().split('T')[0],
    propertyId: q(req, 'propertyId') || undefined,
  });
  res.json({ success: true, data });
}));
