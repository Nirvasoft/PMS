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
  const data = await glService.createAccount(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.put('/accounts/:id', validateRequest(updateAccountSchema), asyncHandler(async (req, res) => {
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
  const data = await glService.createFiscalPeriod(req.user!.companyId, req.body);
  res.status(201).json({ success: true, data });
}));

glRouter.post('/fiscal-periods/generate', asyncHandler(async (req, res) => {
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

glRouter.get('/trial-balance', asyncHandler(async (req, res) => {
  const fromDate = q(req, 'fromDate') || undefined;
  const toDate = q(req, 'toDate') || undefined;
  const data = await glService.getTrialBalance(req.user!.companyId, {
    fromDate,
    toDate,
    propertyId: q(req, 'propertyId') || undefined,
  });

  if (req.query.format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NirvaSoft PMS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Trial Balance');
    const columns = [
      { key: 'code', header: 'Code', width: 14 },
      { key: 'name', header: 'Account Name', width: 34 },
      { key: 'accountType', header: 'Type', width: 16 },
      { key: 'accountSubtype', header: 'Subtype', width: 20 },
      { key: 'totalDebit', header: 'Debit', width: 18 },
      { key: 'totalCredit', header: 'Credit', width: 18 },
      { key: 'netBalance', header: 'Net Balance', width: 18 },
    ];
    sheet.columns = columns.map(c => ({ key: c.key, width: c.width }));

    // Title Row
    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Trial Balance';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF059669' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(1).height = 26;

    // Period & Status Row
    sheet.mergeCells(2, 1, 2, columns.length);
    const subCell = sheet.getCell('A2');
    const periodText = fromDate || toDate ? `Period: ${fromDate || 'Start'} to ${toDate || 'Current'}` : 'Period: All Time';
    subCell.value = `${periodText}   |   Status: ${data.summary.isBalanced ? 'Balanced' : 'Unbalanced'}`;
    subCell.font = { size: 10, color: { argb: 'FF555555' } };
    sheet.getRow(2).height = 18;

    // Header Row (Row 4)
    const headerRow = sheet.getRow(4);
    headerRow.height = 22;
    columns.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx >= 4 ? 'right' : 'left',
      };
    });

    // Data Rows
    for (const r of data.rows) {
      const row = sheet.addRow([
        r.code,
        r.name,
        r.accountType,
        r.accountSubtype || '',
        Number(r.totalDebit || 0),
        Number(r.totalCredit || 0),
        Number(r.netBalance || 0),
      ]);
      row.eachCell((cell, colNum) => {
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } } };
        if (colNum >= 5) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    }

    //Totals Row
    const totalRow = sheet.addRow([
      '',
      'TOTALS',
      '',
      data.summary.isBalanced ? 'Balanced' : 'Unbalanced',
      Number(data.summary.totalDebit || 0),
      Number(data.summary.totalCredit || 0),
      Number((data.summary.totalDebit || 0) - (data.summary.totalCredit || 0)),
    ]);
    totalRow.height = 22;
    totalRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
      };
      if (colNum >= 5) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
      }
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `trial-balance-${toDate || 'current'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
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
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NirvaSoft PMS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Balance Sheet');
    const columns = [
      { key: 'code', header: 'Code', width: 14 },
      { key: 'name', header: 'Account Name', width: 38 },
      { key: 'section', header: 'Section', width: 18 },
      { key: 'accountSubtype', header: 'Subtype', width: 24 },
      { key: 'netBalance', header: 'Net Balance', width: 22 },
    ];
    sheet.columns = columns.map(c => ({ key: c.key, width: c.width }));

    // Title Row
    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Balance Sheet';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF059669' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(1).height = 26;

    // As of Date & Status Row
    sheet.mergeCells(2, 1, 2, columns.length);
    const subCell = sheet.getCell('A2');
    subCell.value = `As of Date: ${asOfDate}   |   Status: ${data.isBalanced ? 'Balanced (A = L + E)' : 'Out of Balance'}`;
    subCell.font = { size: 10, color: { argb: 'FF555555' } };
    sheet.getRow(2).height = 18;

    // Header Row (Row 4)
    const headerRow = sheet.getRow(4);
    headerRow.height = 22;
    columns.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx === 4 ? 'right' : 'left',
        wrapText: false,
      };
    });

    const addAccountRow = (code: string, name: string, section: string, subtype: string, balance: number) => {
      const row = sheet.addRow([code, name, section, subtype, Number(balance || 0)]);
      row.eachCell((cell, colNum) => {
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } } };
        if (colNum === 5) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
        }
      });
    };

    const addSubtotalRow = (label: string, total: number, isGrandTotal = false) => {
      const row = sheet.addRow(['', label, '', '', Number(total || 0)]);
      row.height = 21;
      row.eachCell((cell, colNum) => {
        cell.font = { bold: true, size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isGrandTotal ? 'FFECFDF5' : 'FFF1F5F9' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        };
        if (colNum === 5) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
        }
      });
    };

    // Assets Section
    for (const r of data.assets) {
      addAccountRow(r.code, r.name, 'Assets', r.accountSubtype || '', r.netBalance);
    }
    addSubtotalRow('Total Assets', data.totalAssets, true);
    sheet.addRow([]);

    // Liabilities Section
    for (const r of data.liabilities) {
      addAccountRow(r.code, r.name, 'Liabilities', r.accountSubtype || '', r.netBalance);
    }
    addSubtotalRow('Total Liabilities', data.totalLiabilities);
    sheet.addRow([]);

    // Equity Section
    for (const r of data.equity) {
      addAccountRow(r.code, r.name, 'Equity', r.accountSubtype || '', r.netBalance);
    }
    if (data.retainedEarnings !== 0) {
      addAccountRow('', 'Retained Earnings (Current Period)', 'Equity', 'retained_earnings', data.retainedEarnings);
    }
    addSubtotalRow('Total Equity', data.totalEquity);
    sheet.addRow([]);

    // Total Liabilities + Equity
    addSubtotalRow('Total Liabilities + Equity', data.totalLiabilitiesAndEquity, true);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `balance-sheet-${asOfDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
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
