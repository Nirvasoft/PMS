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
  { header: 'Meter No',   key: 'meterNo',    width: 16, style: { numFmt: '@' } },
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Formats meter billing schedule description as:
 *   "<ChargeName> @<UnitNo> <Month Year>" (e.g. "MEPE @MB1-OCG9 April 2026")
 * where Month Year is derived from the record's Start Date.
 */
function buildMeterScheduleDescription(
  chargeName: string,
  unitNumber: string | null | undefined,
  startDate: Date,
): string {
  const cleanCharge = (chargeName || '').trim();
  const cleanUnit = (unitNumber || '').trim();
  const monthYear = formatMonthYear(startDate);
  return [cleanCharge, cleanUnit ? `@${cleanUnit}` : '', monthYear].filter(Boolean).join(' ');
}

interface MeterSetupChargeInfo {
  meterNo: string;
  chargeTypeId: string | null;
  chargeType: {
    id: string;
    name: string;
    code: string;
    departmentCenterId: string | null;
    costCenterId: string | null;
    glAccountCode: string | null;
  } | null;
}

async function buildMeterSetupLookup(propertyId: string, companyId: string) {
  const setups = await prisma.meterSetup.findMany({
    where: { propertyId, companyId, isActive: true },
    select: {
      meterNo: true,
      chargeTypeId: true,
      chargeType: {
        select: {
          id: true,
          name: true,
          code: true,
          departmentCenterId: true,
          costCenterId: true,
          glAccountCode: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  const exactMap = new Map<string, MeterSetupChargeInfo>();
  const strippedMap = new Map<string, MeterSetupChargeInfo>();

  const register = (map: Map<string, MeterSetupChargeInfo>, key: string, item: MeterSetupChargeInfo) => {
    if (!key) return;
    const prev = map.get(key);
    // Prefer an entry that actually has a chargeType linked from Meter Setup
    if (!prev || (!prev.chargeTypeId && item.chargeTypeId)) {
      map.set(key, item);
    }
  };

  for (const s of setups) {
    const key = s.meterNo.trim().toLowerCase();
    register(exactMap, key, s);
    const stripped = key.replace(/^0+/, '');
    if (stripped && stripped !== key) {
      register(strippedMap, stripped, s);
    }
  }

  return (meterNo: string): MeterSetupChargeInfo | null => {
    const key = String(meterNo ?? '').trim().toLowerCase();
    if (!key) return null;
    const exact = exactMap.get(key);
    if (exact) return exact;
    const stripped = key.replace(/^0+/, '');
    return stripped ? (strippedMap.get(stripped) ?? null) : null;
  };
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

    const targetBillDate = isoToUtcDate(billDate);

    for (const m of meterSetups) {
      const trimmedMeterNo = m.meterNo.trim();
      // A meter's assigned unit is looked up the same way meterSetup.service.ts's delete
      // guard does — by matching meterNo/meterSerialNo within the same property.
      const utilityMeter = await prisma.utilityMeter.findFirst({
        where: { meterSerialNo: { equals: trimmedMeterNo, mode: 'insensitive' }, propertyId },
        select: { unitId: true, lastReading: true },
      });

      let unitCode = '';
      let tenant = '';
      let hasActiveLease = false;
      if (utilityMeter) {
        const unit = await prisma.unit.findUnique({ where: { id: utilityMeter.unitId }, select: { unitNumber: true } });
        unitCode = unit?.unitNumber ?? '';

        const lease = await prisma.lease.findFirst({
          where: { unitId: utilityMeter.unitId, status: 'active' },
          select: { tenant: { select: { code: true, firstName: true, tenantType: true } } },
          orderBy: { startDate: 'desc' },
        });
        if (lease) {
          hasActiveLease = true;
          // Same source as the "Code" shown on the Tenants list/detail page: individual
          // tenants store it in `firstName` (see CreateTenantPage's Code field); `code` is
          // a legacy column only backfilled once and left unset for company tenants.
          const t = lease.tenant;
          tenant = t ? (t.tenantType === 'company' ? (t.code ?? '') : (t.firstName ?? t.code ?? '')) : '';
        }
      }

      // Skip meters on unoccupied units when occupiedOnly is requested.
      if (occupiedOnly && !hasActiveLease) continue;

      // Populate Start Unit from the latest previous record's End Unit for this meter
      // (falling back to any latest record for the meter, then utilityMeter.lastReading, then 0).
      const prevRecord =
        (await prisma.meterRecordList.findFirst({
          where: {
            propertyId,
            companyId,
            meterNo: { equals: trimmedMeterNo, mode: 'insensitive' },
            billDate: { lte: targetBillDate },
          },
          orderBy: [{ endDate: 'desc' }, { billDate: 'desc' }, { createdAt: 'desc' }],
          select: { endUnit: true },
        })) ??
        (await prisma.meterRecordList.findFirst({
          where: {
            propertyId,
            companyId,
            meterNo: { equals: trimmedMeterNo, mode: 'insensitive' },
          },
          orderBy: [{ endDate: 'desc' }, { billDate: 'desc' }, { createdAt: 'desc' }],
          select: { endUnit: true },
        }));

      const startUnit = prevRecord
        ? prevRecord.endUnit.toNumber()
        : utilityMeter?.lastReading
          ? utilityMeter.lastReading.toNumber()
          : 0;

      sheet.addRow({
        property: property.name,
        tenant,
        unitCode,
        meterType: METER_TYPE_LABELS[m.meterType] || m.meterType,
        meterNo: m.meterNo,
        category: CATEGORY_LABELS[m.category] || m.category,
        rate: m.rate ? m.rate.toNumber() : 0,
        startUnit,
        endUnit: 0,
        totalUnit: 0,
        startDate: '',
        endDate: '',
        billDate: targetBillDate,
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
      filename: `meter-records-${property.code || property.name || propertyId}-${billDate}.xlsx`,
    };
  }

  /**
   * Parses an uploaded .xlsx without writing anything, so the client can show the rows as a
   * preview before the user confirms the import. Resolves each row's current tenant and
   * whether it's billable, mirroring exactly what importExcel() would do.
   */
  async previewExcel(propertyId: string, companyId: string, fileBuffer: Buffer) {
    const rows = await parseImportRows(propertyId, companyId, fileBuffer);
    const findMeterSetup = await buildMeterSetupLookup(propertyId, companyId);

    return Promise.all(rows.map(async (r) => {
      const unit = await prisma.unit.findUnique({ where: { id: r.unitId as string }, select: { unitNumber: true } });
      const lease = await prisma.lease.findFirst({
        where: { unitId: r.unitId as string, status: 'active' },
        orderBy: { startDate: 'desc' },
        select: { tenantId: true },
      });
      const meterSetup = findMeterSetup(r.meterNo);
      const chargeName = meterSetup?.chargeType?.name || resolveChargeTypeCode(r.meterType, r.category);

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
        chargeTypeName: chargeName,
        description: buildMeterScheduleDescription(chargeName, unit?.unitNumber, r.startDate as Date),
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
   * End Unit - Start Unit, amount = rate) so it flows into the normal invoicing
   * cycle. The schedule's start/end date are both the row's Bill Date, so it self-completes
   * after generating exactly one invoice rather than recurring with stale readings.
   */
  async importExcel(
    propertyId: string,
    companyId: string,
    userId: string,
    fileBuffer: Buffer,
  ): Promise<{
    imported: number;
    billingSchedulesCreated: number;
    billingSchedulesUpdated: number;
    skipped: number;
    duplicatesSkipped: number;
  }> {
    const property = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
    if (!property) throw AppError.notFound('Property');

    const parsedRows = await parseImportRows(propertyId, companyId, fileBuffer);

    const [findMeterSetup, propertyUnits, existingHistory, existingMeterSchedules] = await Promise.all([
      buildMeterSetupLookup(propertyId, companyId),
      prisma.unit.findMany({ where: { propertyId }, select: { id: true, unitNumber: true } }),
      prisma.meterRecordList.findMany({
        where: { companyId, propertyId },
        select: { meterNo: true, startDate: true, endDate: true },
      }),
      prisma.billingSchedule.findMany({
        where: {
          companyId,
          propertyId,
          meterNo: { not: null },
          status: { not: 'cancelled' },
        },
        select: { id: true, meterNo: true, status: true, startDate: true, endDate: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const unitNumberById = new Map(propertyUnits.map((u) => [u.id, u.unitNumber]));
    const canonicalMeterNoFor = (raw: string): string => {
      const setup = findMeterSetup(raw);
      return (setup?.meterNo || String(raw ?? '')).trim();
    };

    // A row is already in meter_record_list history when its Meter No + Start Date + End Date match.
    // Never update existing meter_record_list rows — append only genuinely new period rows.
    const dupeKey = (meterNo: string, startDate: Date, endDate: Date) =>
      `${canonicalMeterNoFor(meterNo).toLowerCase()}|${toDateOnly(startDate)}|${toDateOnly(endDate)}`;
    const existingKeys = new Set(existingHistory.map((e) => dupeKey(e.meterNo, e.startDate, e.endDate)));

    const seenInSheet = new Set<string>();
    let duplicatesSkipped = 0;
    const newHistoryRows: Prisma.MeterRecordListCreateManyInput[] = [];
    const duplicateHistoryRows: Array<Omit<Prisma.MeterRecordListCreateManyInput, 'companyId' | 'propertyId'>> = [];

    for (const r of parsedRows) {
      const key = dupeKey(r.meterNo as string, r.startDate as Date, r.endDate as Date);
      if (seenInSheet.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      seenInSheet.add(key);
      if (existingKeys.has(key)) {
        duplicatesSkipped++;
        duplicateHistoryRows.push(r);
      } else {
        newHistoryRows.push({ ...r, companyId, propertyId });
      }
    }

    if (newHistoryRows.length > 0) {
      await prisma.meterRecordList.createMany({ data: newHistoryRows });
    }

    // Index existing non-cancelled meter billing schedules by meterNo (exact + leading-zero tolerant)
    type TrackedSchedule = { id: string; meterNo: string; status: string; startDate: Date; endDate: Date | null };
    const schedExactMap = new Map<string, TrackedSchedule>();
    const schedStrippedMap = new Map<string, TrackedSchedule>();
    const registerTrackedSchedule = (s: TrackedSchedule, overwrite = false) => {
      const key = s.meterNo.trim().toLowerCase();
      if (!key) return;
      if (overwrite || !schedExactMap.has(key)) schedExactMap.set(key, s);
      const stripped = key.replace(/^0+/, '');
      if (stripped && stripped !== key && (overwrite || !schedStrippedMap.has(stripped))) {
        schedStrippedMap.set(stripped, s);
      }
    };
    for (const s of existingMeterSchedules) {
      if (s.meterNo) {
        registerTrackedSchedule({
          id: s.id,
          meterNo: s.meterNo,
          status: s.status,
          startDate: s.startDate,
          endDate: s.endDate,
        });
      }
    }
    const findExistingMeterSchedule = (meterNo: string): TrackedSchedule | null => {
      const key = String(meterNo ?? '').trim().toLowerCase();
      if (!key) return null;
      const exact = schedExactMap.get(key);
      if (exact) return exact;
      const stripped = key.replace(/^0+/, '');
      return stripped ? (schedStrippedMap.get(stripped) ?? null) : null;
    };

    let billingSchedulesCreated = 0;
    let billingSchedulesUpdated = 0;
    let skipped = 0;

    const scheduleRows: Array<{
      row: Omit<Prisma.MeterRecordListCreateManyInput, 'companyId' | 'propertyId'>;
      isDuplicateHistory: boolean;
    }> = [
      ...newHistoryRows.map((row) => ({ row, isDuplicateHistory: false })),
      ...duplicateHistoryRows.map((row) => ({ row, isDuplicateHistory: true })),
    ];

    for (const { row: r, isDuplicateHistory } of scheduleRows) {
      const lease = await prisma.lease.findFirst({
        where: { unitId: r.unitId as string, status: 'active' },
        orderBy: { startDate: 'desc' },
        select: { id: true, tenantId: true },
      });
      if (!lease) {
        if (!isDuplicateHistory) skipped++;
        continue;
      }

      const meterType = r.meterType as string;
      const category = r.category as string;
      const meterSetup = findMeterSetup(r.meterNo);
      const canonicalMeterNo = (meterSetup?.meterNo || String(r.meterNo ?? '')).trim();
      const chargeTypeId =
        meterSetup?.chargeTypeId ||
        (await resolveChargeTypeId(companyId, resolveChargeTypeCode(meterType, category)));

      if (!chargeTypeId) {
        if (!isDuplicateHistory) skipped++;
        continue;
      }

      const chargeType =
        meterSetup?.chargeType && meterSetup.chargeType.id === chargeTypeId
          ? meterSetup.chargeType
          : await prisma.chargeType.findUnique({
              where: { id: chargeTypeId },
              select: { id: true, name: true, code: true, departmentCenterId: true, costCenterId: true, glAccountCode: true },
            });
      let departmentCenterId = chargeType?.departmentCenterId ?? null;
      let costCenterId = chargeType?.costCenterId ?? null;
      if ((!departmentCenterId || !costCenterId) && chargeType?.glAccountCode?.trim()) {
        const glAccount = await prisma.glAccount.findFirst({
          where: {
            companyId,
            code: chargeType.glAccountCode.trim(),
            isActive: true,
            OR: [{ propertyId }, { propertyId: null }],
          },
          orderBy: { propertyId: 'asc' },
          select: { departmentCenterId: true, costCenterId: true },
        });
        departmentCenterId = departmentCenterId || glAccount?.departmentCenterId || null;
        costCenterId = costCenterId || glAccount?.costCenterId || null;
      }
      if (!departmentCenterId || !costCenterId) {
        const fallbackSchedule = await prisma.billingSchedule.findFirst({
          where: {
            leaseId: lease.id,
            departmentCenterId: { not: null },
            costCenterId: { not: null },
          },
          select: { departmentCenterId: true, costCenterId: true },
        });
        departmentCenterId = departmentCenterId || fallbackSchedule?.departmentCenterId || null;
        costCenterId = costCenterId || fallbackSchedule?.costCenterId || null;
      }

      const quantity = Number(r.endUnit) - Number(r.startUnit);
      const startDate = r.startDate as Date;
      const endDate = r.endDate as Date;
      const billDate = r.billDate as Date;
      const unitNumber = unitNumberById.get(r.unitId as string) ?? '';
      const chargeName = chargeType?.name || meterType;
      const description = buildMeterScheduleDescription(chargeName, unitNumber, startDate);

      const existingSchedule =
        findExistingMeterSchedule(canonicalMeterNo) ?? findExistingMeterSchedule(r.meterNo);

      if (existingSchedule) {
        if (isDuplicateHistory) {
          // For re-imports of an already-recorded period:
          // - Never re-open a schedule already invoiced/completed
          // - Only update when the schedule still represents this same unbilled period
          const samePeriod =
            toDateOnly(existingSchedule.startDate) === toDateOnly(startDate) &&
            Boolean(existingSchedule.endDate && toDateOnly(existingSchedule.endDate) === toDateOnly(endDate));
          if (existingSchedule.status === 'completed' || !samePeriod) {
            continue;
          }
        }

        const updated = await prisma.billingSchedule.update({
          where: { id: existingSchedule.id },
          data: {
            unitId: r.unitId as string,
            tenantId: lease.tenantId,
            leaseId: lease.id,
            departmentCenterId,
            costCenterId,
            chargeTypeId,
            meterNo: canonicalMeterNo,
            description,
            amount: Number(r.rate),
            quantity,
            currency: property.currency,
            billingCycle: property.billingCycle,
            billingDay: property.billingDay,
            startDate,
            endDate,
            nextBillingDate: billDate,
            isProrated: false,
            prorateStart: null,
            status: 'active',
          },
          select: { id: true, meterNo: true, status: true, startDate: true, endDate: true },
        });
        registerTrackedSchedule(
          {
            id: updated.id,
            meterNo: updated.meterNo || canonicalMeterNo,
            status: updated.status,
            startDate: updated.startDate,
            endDate: updated.endDate,
          },
          true,
        );
        billingSchedulesUpdated++;
      } else {
        const created = await billingSchedulesService.create(companyId, {
          propertyId,
          unitId: r.unitId,
          tenantId: lease.tenantId,
          leaseId: lease.id,
          departmentCenterId,
          costCenterId,
          chargeTypeId,
          meterNo: canonicalMeterNo,
          description,
          amount: Number(r.rate),
          quantity,
          currency: property.currency,
          billingCycle: property.billingCycle,
          billingDay: property.billingDay,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          nextBillingDate: billDate.toISOString(),
          isProrated: false,
        }, userId);
        registerTrackedSchedule(
          {
            id: created.id,
            meterNo: canonicalMeterNo,
            status: created.status,
            startDate: created.startDate,
            endDate: created.endDate,
          },
          true,
        );
        billingSchedulesCreated++;
      }
    }

    return {
      imported: newHistoryRows.length,
      billingSchedulesCreated,
      billingSchedulesUpdated,
      skipped,
      duplicatesSkipped,
    };
  }
}

export const meterRecordsService = new MeterRecordsService();
