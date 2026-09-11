import ExcelJS from 'exceljs';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { billingSchedulesService } from '../billing/billingSchedules.service';
import type { Prisma } from '@prisma/client';

const EXPORT_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Property',   key: 'property',   width: 20 },
  { header: 'Tenant',     key: 'tenant',     width: 20 },
  { header: 'P Unit',     key: 'unitCode',   width: 16 },
  { header: 'Meter Type', key: 'meterType',  width: 16 },
  { header: 'Meter No',   key: 'meterNo',    width: 16 },
  { header: 'Category',   key: 'category',   width: 14 },
  { header: 'Rate',       key: 'rate',       width: 10 },
  { header: 'Start Unit', key: 'startUnit',  width: 12 },
  { header: 'End Unit',   key: 'endUnit',    width: 12 },
  { header: 'Total Unit', key: 'totalUnit',  width: 12 },
  { header: 'Start Date', key: 'startDate',  width: 14, style: { numFmt: 'm/d/yyyy' } },
  { header: 'End Date',   key: 'endDate',    width: 14, style: { numFmt: 'm/d/yyyy' } },
  { header: 'Bill Date',  key: 'billDate',   width: 14, style: { numFmt: 'm/d/yyyy' } },
];

// 'Tenant' (matched by Tenant Code) is optional on import — a blank cell just leaves the
// row's tenantCode unset — so it's not in the required column list.
const REQUIRED_IMPORT_COLUMNS = [
  'meter no', 'p unit', 'meter type', 'category', 'rate',
  'start unit', 'end unit', 'start date', 'end date', 'bill date',
];

// Mirrors client/src/pages/admin/BillingPage/MeterSetupPage.tsx's METER_TYPES/CATEGORIES labels.
const METER_TYPE_LABELS: Record<string, string> = {
  mepe: 'MEPE Meter',
  sub_meter: 'Sub Meter',
  ct_meter: 'CT Meter',
  water_meter: 'Water Meter',
};

const CATEGORY_LABELS: Record<string, string> = {
  lighting: 'Lighting',
  water: 'Water',
  aircon: 'AirCon',
  aircon_lighting: 'Aircon/Lighting',
  lighting_telenor: 'Lighting(Telenor)',
};

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** "YYYY-MM-DD" -> a real UTC-midnight Date, so the cell's `m/d/yyyy` numFmt renders it correctly. */
function isoToUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/**
 * Parses a date cell to a UTC-midnight Date matching its displayed calendar date.
 * Avoids the classic off-by-one bug where `new Date("9/1/2026")` is parsed as local
 * midnight, then shifts to the previous day once read back in UTC (e.g. any TZ ahead
 * of UTC — including Asia/Yangon, where this app runs).
 */
function parseDateCell(v: unknown, field: string, rowNumber: number): Date {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // ExcelJS date cells are UTC-based; re-anchor via UTC getters to strip any time-of-day.
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // M/D/YYYY or MM/DD/YYYY
    if (slash) {
      const [, m, d, y] = slash;
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // YYYY-MM-DD
    if (iso) {
      const [, y, m, d] = iso;
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }
  throw AppError.badRequest(`Row ${rowNumber}: invalid ${field} "${String(v ?? '')}"`, 'INVALID_FILE');
}

function parseNumberCell(v: unknown, field: string, rowNumber: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (isNaN(n)) throw AppError.badRequest(`Row ${rowNumber}: invalid ${field} "${String(v ?? '')}"`, 'INVALID_FILE');
  return n;
}

/** ELECTRICITY/WATER are the only utility ChargeType codes seeded system-wide (see chargeTypes.service.ts). */
function resolveChargeTypeCode(meterTypeLabel: string, categoryLabel: string): 'WATER' | 'ELECTRICITY' {
  return `${meterTypeLabel} ${categoryLabel}`.toLowerCase().includes('water') ? 'WATER' : 'ELECTRICITY';
}

async function resolveChargeTypeId(companyId: string, code: string): Promise<string | null> {
  const companySpecific = await prisma.chargeType.findFirst({ where: { code, companyId } });
  if (companySpecific) return companySpecific.id;
  const system = await prisma.chargeType.findFirst({ where: { code, companyId: null } });
  return system?.id ?? null;
}

/** Parses & validates an uploaded .xlsx into create-ready rows, shared by preview and import. */
async function parseImportRows(propertyId: string, companyId: string, fileBuffer: Buffer): Promise<Omit<Prisma.MeterRecordListCreateManyInput, 'companyId' | 'propertyId'>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw AppError.badRequest('No worksheet found in the uploaded file', 'INVALID_FILE');

  const colIndex: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    colIndex[String(cell.value ?? '').trim().toLowerCase()] = colNumber;
  });

  const missing = REQUIRED_IMPORT_COLUMNS.filter((c) => !(c in colIndex));
  if (missing.length > 0) {
    throw AppError.badRequest(`Missing column(s): ${missing.join(', ')}`, 'INVALID_FILE');
  }

  const units = await prisma.unit.findMany({ where: { propertyId }, select: { id: true, unitNumber: true } });
  const unitByCode = new Map(units.map((u) => [u.unitNumber.trim().toLowerCase(), u.id]));

  // Validated against real Tenant Codes from the Tenant List, but the row stores the code
  // text itself (not a tenant id) — keyed here by the lowercase code, valued by its
  // canonical casing as it appears on the Tenant List.
  const tenants = await prisma.tenant.findMany({
    where: { companyId, deletedAt: null, code: { not: null } },
    select: { code: true },
  });
  const knownCodes = new Map(
    tenants.map((t): [string, string] => [(t.code as string).trim().toLowerCase(), t.code as string]),
  );

  const cell = (row: ExcelJS.Row, name: string) => row.getCell(colIndex[name]).value;
  const rows: Omit<Prisma.MeterRecordListCreateManyInput, 'companyId' | 'propertyId'>[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const meterNo = String(cell(row, 'meter no') ?? '').trim();
    if (!meterNo) return; // skip blank rows

    const unitCode = String(cell(row, 'p unit') ?? '').trim();
    const unitId = unitByCode.get(unitCode.toLowerCase());
    if (!unitId) {
      throw AppError.badRequest(`Row ${rowNumber}: unit "${unitCode}" not found in this property`, 'INVALID_FILE');
    }

    let tenantCode: string | null = null;
    if ('tenant' in colIndex) {
      const tenantCodeCell = String(cell(row, 'tenant') ?? '').trim();
      if (tenantCodeCell) {
        const knownCode = knownCodes.get(tenantCodeCell.toLowerCase());
        if (!knownCode) {
          throw AppError.badRequest(`Row ${rowNumber}: tenant "${tenantCodeCell}" not found`, 'INVALID_FILE');
        }
        tenantCode = knownCode;
      }
    }

    const startUnit = parseNumberCell(cell(row, 'start unit'), 'Start Unit', rowNumber);
    const endUnit = parseNumberCell(cell(row, 'end unit'), 'End Unit', rowNumber);
    if (endUnit <= startUnit) {
      throw AppError.badRequest(`Row ${rowNumber}: End Unit must be greater than Start Unit`, 'INVALID_FILE');
    }

    rows.push({
      unitId,
      tenantCode,
      meterNo,
      meterType: String(cell(row, 'meter type') ?? '').trim(),
      category: String(cell(row, 'category') ?? '').trim(),
      rate: parseNumberCell(cell(row, 'rate'), 'Rate', rowNumber),
      startUnit,
      endUnit,
      startDate: parseDateCell(cell(row, 'start date'), 'Start Date', rowNumber),
      endDate: parseDateCell(cell(row, 'end date'), 'End Date', rowNumber),
      billDate: parseDateCell(cell(row, 'bill date'), 'Bill Date', rowNumber),
    });
  });

  if (rows.length === 0) {
    throw AppError.badRequest('No valid rows found to import', 'INVALID_FILE');
  }

  return rows;
}

class MeterRecordsService {
  /**
   * Generates a fill-in-the-blanks billing sheet for the given cycle: one row per active
   * Meter Setup entry, with Property/Tenant/Meter No/P Unit/Meter Type/Category/Rate pre-filled
   * from Meter Setup (and the unit/tenant it's assigned to), Start/End Unit defaulted to 0,
   * Start/End Date left blank, and Bill Date stamped with the chosen cycle date — ready for
   * the user to fill in readings and dates, then re-import via importExcel().
   */
  async exportTemplate(propertyId: string, companyId: string, billDate: string, occupiedOnly = false): Promise<{ buffer: Buffer; filename: string }> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, companyId },
      select: { code: true, name: true },
    });
    if (!property) throw AppError.notFound('Property');

    const meterSetups = await prisma.meterSetup.findMany({
      where: { propertyId, companyId, isActive: true },
      orderBy: { meterNo: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NirvaSoft PMS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Meter Records');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };

    for (const m of meterSetups) {
      // A meter's assigned unit is looked up the same way meterSetup.service.ts's delete
      // guard does — by matching meterNo/meterSerialNo within the same property.
      const utilityMeter = await prisma.utilityMeter.findFirst({
        where: { meterSerialNo: m.meterNo, propertyId },
        select: { unitId: true },
      });

      let unitCode = '';
      let tenant = '';
      let hasActiveLease = false;
      if (utilityMeter) {
        const unit = await prisma.unit.findUnique({ where: { id: utilityMeter.unitId }, select: { unitNumber: true } });
        unitCode = unit?.unitNumber ?? '';

        const lease = await prisma.lease.findFirst({
          where: { unitId: utilityMeter.unitId, status: 'active' },
          select: { tenant: { select: { code: true } } },
          orderBy: { startDate: 'desc' },
        });
        if (lease) {
          hasActiveLease = true;
          tenant = lease.tenant?.code ?? '';
        }
      }

      // Skip meters on unoccupied units when occupiedOnly is requested.
      if (occupiedOnly && !hasActiveLease) continue;

      sheet.addRow({
        property: property.name,
        tenant,
        unitCode,
        meterType: METER_TYPE_LABELS[m.meterType] || m.meterType,
        meterNo: m.meterNo,
        category: CATEGORY_LABELS[m.category] || m.category,
        rate: m.rate ? m.rate.toNumber() : 0,
        startUnit: 0,
        endUnit: 0,
        totalUnit: 0,
        startDate: '',
        endDate: '',
        billDate: isoToUtcDate(billDate),
      });
    }

    // Data validation: Start/End Date must be real dates, and End Unit must exceed Start
    // Unit on the same row. Applied a few hundred rows past the generated data too, so
    // rows the user adds manually for extra meters stay validated.
    // Column layout (1-indexed): A=Property B=Tenant C=P Unit D=Meter Type E=Meter No
    //   F=Category G=Rate H=Start Unit I=End Unit J=Total Unit K=Start Date L=End Date M=Bill Date
    const lastRow = meterSetups.length + 1 + 200;
    for (let row = 2; row <= lastRow; row++) {
      const dateRule: ExcelJS.DataValidation = {
        type: 'date', operator: 'between', allowBlank: true,
        showErrorMessage: true, errorStyle: 'error',
        errorTitle: 'Invalid Date', error: 'Please enter a valid date.',
        formulae: [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2099, 11, 31))],
      };
      sheet.getCell(`K${row}`).dataValidation = dateRule; // Start Date
      sheet.getCell(`L${row}`).dataValidation = dateRule; // End Date
      sheet.getCell(`I${row}`).dataValidation = {         // End Unit > Start Unit
        type: 'decimal', operator: 'greaterThan', allowBlank: true,
        showErrorMessage: true, errorStyle: 'error',
        errorTitle: 'Invalid End Unit', error: 'End Unit must be greater than Start Unit.',
        formulae: [`H${row}`],
      };
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      filename: `meter-records-${property.code}-${billDate}.xlsx`,
    };
  }

  /**
   * Parses an uploaded .xlsx without writing anything, so the client can show the rows as a
   * preview before the user confirms the import. Resolves each row's current tenant and
   * whether it's billable, mirroring exactly what importExcel() would do.
   */
  async previewExcel(propertyId: string, companyId: string, fileBuffer: Buffer) {
    const rows = await parseImportRows(propertyId, companyId, fileBuffer);

    return Promise.all(rows.map(async (r) => {
      const unit = await prisma.unit.findUnique({ where: { id: r.unitId as string }, select: { unitNumber: true } });
      const lease = await prisma.lease.findFirst({
        where: { unitId: r.unitId as string, status: 'active' },
        orderBy: { startDate: 'desc' },
        select: { tenantId: true },
      });

      // Show the sheet's own Tenant Code; fall back to the unit's currently active lease's
      // tenant when the cell was left blank (informational only — not what gets stored).
      let tenant = (r.tenantCode as string | null) ?? '';
      if (!tenant && lease?.tenantId) {
        const t = await prisma.tenant.findUnique({ where: { id: lease.tenantId }, select: { code: true } });
        tenant = t?.code ?? '';
      }

      return {
        meterNo: r.meterNo,
        unitCode: unit?.unitNumber ?? '',
        meterType: r.meterType,
        category: r.category,
        rate: Number(r.rate),
        startUnit: Number(r.startUnit),
        endUnit: Number(r.endUnit),
        quantity: Number(r.endUnit) - Number(r.startUnit),
        startDate: toDateOnly(r.startDate as Date),
        endDate: toDateOnly(r.endDate as Date),
        billDate: toDateOnly(r.billDate as Date),
        tenant,
        willBill: !!lease?.tenantId,
      };
    }));
  }

  /**
   * Bulk-appends rows from an uploaded .xlsx (columns matching the Export layout) into the
   * meter_record_list audit log — never surfaced in any UI list — and, for each row whose
   * unit currently has an active tenant, binds it to a one-off BillingSchedule (quantity =
   * End Unit - Start Unit, amount = quantity * rate) so it flows into the normal invoicing
   * cycle. The schedule's start/end date are both the row's Bill Date, so it self-completes
   * after generating exactly one invoice rather than recurring with stale readings.
   */
  async importExcel(propertyId: string, companyId: string, userId: string, fileBuffer: Buffer): Promise<{ imported: number; billingSchedulesCreated: number; skipped: number; duplicatesSkipped: number }> {
    const property = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
    if (!property) throw AppError.notFound('Property');

    const parsedRows = await parseImportRows(propertyId, companyId, fileBuffer);

    // A row is a duplicate of one already on record for this property (re-imports of the
    // same sheet), or of another row in this same sheet, when its Meter No + Start Date +
    // End Date all match — skip it rather than writing another copy.
    const existing = await prisma.meterRecordList.findMany({
      where: { companyId, propertyId },
      select: { meterNo: true, startDate: true, endDate: true },
    });
    const dupeKey = (meterNo: string, startDate: Date, endDate: Date) => `${meterNo}|${toDateOnly(startDate)}|${toDateOnly(endDate)}`;
    const existingKeys = new Set(existing.map((e) => dupeKey(e.meterNo, e.startDate, e.endDate)));

    const seenInSheet = new Set<string>();
    let duplicatesSkipped = 0;
    const dedupedRows = parsedRows.filter((r) => {
      const key = dupeKey(r.meterNo as string, r.startDate as Date, r.endDate as Date);
      if (existingKeys.has(key) || seenInSheet.has(key)) {
        duplicatesSkipped++;
        return false;
      }
      seenInSheet.add(key);
      return true;
    });

    const rows: Prisma.MeterRecordListCreateManyInput[] = dedupedRows.map((r) => ({ ...r, companyId, propertyId }));

    if (rows.length > 0) {
      await prisma.meterRecordList.createMany({ data: rows });
    }

    let billingSchedulesCreated = 0;
    let skipped = 0;
    for (const r of rows) {
      const lease = await prisma.lease.findFirst({
        where: { unitId: r.unitId as string, status: 'active' },
        orderBy: { startDate: 'desc' },
        select: { id: true, tenantId: true },
      });
      const meterType = r.meterType as string;
      const category = r.category as string;
      const chargeTypeId = lease ? await resolveChargeTypeId(companyId, resolveChargeTypeCode(meterType, category)) : null;

      if (!lease || !chargeTypeId) { skipped++; continue; }

      const quantity = Number(r.endUnit) - Number(r.startUnit);
      const billDateIso = (r.billDate as Date).toISOString();

      await billingSchedulesService.create(companyId, {
        propertyId,
        unitId: r.unitId,
        tenantId: lease.tenantId,
        leaseId: lease.id,
        chargeTypeId,
        description: `${meterType} — ${r.meterNo} (${toDateOnly(r.startDate as Date)} to ${toDateOnly(r.endDate as Date)})`,
        amount: quantity * Number(r.rate),
        quantity,
        currency: property.currency,
        billingCycle: property.billingCycle,
        billingDay: property.billingDay,
        startDate: billDateIso,
        endDate: billDateIso,
      }, userId);
      billingSchedulesCreated++;
    }

    return { imported: rows.length, billingSchedulesCreated, skipped, duplicatesSkipped };
  }
}

export const meterRecordsService = new MeterRecordsService();
