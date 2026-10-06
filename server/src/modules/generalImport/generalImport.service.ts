import ExcelJS from 'exceljs';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { unitsService, metersService } from '../units/units.service';
import { leasesService } from '../leases/services/leases.service';

export type ImportType = 'meter' | 'unit' | 'lease' | 'tenant' | 'lead';
export const IMPORT_TYPES: ImportType[] = ['meter', 'unit', 'lease', 'tenant', 'lead'];

interface ColumnDef {
  header: string;
  key: string;
  required?: boolean;
  samples: (string | number)[];
}

interface ParsedRow {
  rowNo: number;
  data: Record<string, string>;
}

export interface PreviewRow {
  rowNo: number;
  data: Record<string, string>;
  status: 'valid' | 'skip' | 'error';
  /** Error messages when status is 'error'; informational notes otherwise. */
  errors: string[];
}

/** Floor column may hold either the floor label or the floor number. */
function resolveFloor<T extends { floorLabel: string; floorNumber: number }>(floors: T[], text: string): T | undefined {
  const t = (text || '').trim().toLowerCase();
  if (!t) return undefined;
  return floors.find((f) => f.floorLabel.toLowerCase() === t) ?? floors.find((f) => String(f.floorNumber) === t);
}

/** Identity of a meter_setups row for the skip rule: Meter No + Floor + Category. */
const meterKey = (meterNo: string, floorId: string | null, category: string) =>
  `${meterNo.toLowerCase()}|${floorId ?? ''}|${category.toLowerCase()}`;

const METER_TYPES = ['mepe', 'sub_meter', 'ct_meter', 'water_meter'];
const METER_CATEGORIES = ['lighting', 'water', 'aircon', 'aircon_lighting', 'lighting_telenor'];
const USAGE_TYPES = ['tenant_used', 'common_used', 'office_used'];
const CALC_TYPES = ['per_unit', 'fixed'];
const BILLING_CYCLES = ['monthly', 'quarterly', 'semi_annual', 'annual'];

const COLUMNS: Record<ImportType, ColumnDef[]> = {
  tenant: [
    { header: 'Property Code', key: 'propertyCode', samples: ['PRP-001', 'PRP-001'] },
    { header: 'Tenant Type', key: 'tenantType', required: true, samples: ['individual', 'company'] },
    { header: 'Code', key: 'code', required: true, samples: ['TEN-001', 'TEN-002'] },
    { header: 'Name', key: 'name', required: true, samples: ['John Smith', 'ABC Trading Co., Ltd.'] },
    { header: 'DOB', key: 'dob', samples: ['1990-05-12', '1985-11-30'] },
    { header: 'Gender', key: 'gender', samples: ['male', 'female'] },
    { header: 'Mobile', key: 'mobile', samples: ['09123456789', '09987654321'] },
    { header: 'Address', key: 'address', samples: ['No. 1, Main Street', 'No. 2, Park Road'] },
  ],
  meter: [
    { header: 'Property Code', key: 'propertyCode', samples: ['PRP-001', 'PRP-001'] },
    { header: 'Floor', key: 'floor', samples: ['1F', '2F'] },
    { header: 'Meter Type', key: 'meterType', required: true, samples: ['mepe', 'sub_meter'] },
    { header: 'Meter No', key: 'meterNo', required: true, samples: ['MTR-001', 'MTR-002'] },
    { header: 'Main Meter', key: 'mainMeter', samples: ['', 'MTR-001'] },
    { header: 'Category', key: 'category', required: true, samples: ['lighting', 'aircon'] },
    { header: 'Maintenance Fee', key: 'maintenanceFee', samples: [0, 10] },
    { header: 'Usage Type', key: 'usageType', samples: ['tenant_used', 'common_used'] },
    { header: 'Rate', key: 'rate', samples: [250, 300] },
    { header: 'Calculation Type', key: 'calculationType', samples: ['per_unit', 'fixed'] },
    { header: 'Unit Number', key: 'unitNumber', samples: ['A-101', ''] },
  ],
  unit: [
    { header: 'Unit Number', key: 'unitNumber', required: true, samples: ['A-101', 'A-102'] },
    { header: 'Unit Type', key: 'unitType', required: true, samples: ['1br', '2br'] },
    { header: 'Floor Number', key: 'floorNumber', samples: [1, 1] },
    { header: 'Floor Label', key: 'floorLabel', samples: ['1F', '1F'] },
    { header: 'Zone', key: 'zone', samples: ['North', 'South'] },
    { header: 'Area Sqft', key: 'areaSqft', samples: [650, 900] },
    { header: 'Bedrooms', key: 'bedroomCount', samples: [1, 2] },
    { header: 'Bathrooms', key: 'bathroomCount', samples: [1, 2] },
    { header: 'Furnishing', key: 'furnishing', samples: ['unfurnished', 'furnished'] },
    { header: 'Rate', key: 'rate', samples: [500, 750] },
    { header: 'Currency', key: 'currency', required: true, samples: ['USD', 'USD'] },
    { header: 'Description', key: 'description', samples: ['Sample unit', ''] },
  ],
  lease: [
    { header: 'Unit Number', key: 'unitNumber', required: true, samples: ['A-101', 'A-102'] },
    { header: 'Tenant Code', key: 'tenantCode', required: true, samples: ['TEN-001', 'TEN-002'] },
    { header: 'Start Date (YYYY-MM-DD)', key: 'startDate', required: true, samples: ['2026-01-01', '2026-02-01'] },
    { header: 'End Date (YYYY-MM-DD)', key: 'endDate', required: true, samples: ['2026-12-31', '2027-01-31'] },
    { header: 'Rent Amount', key: 'rentAmount', required: true, samples: [500, 750] },
    { header: 'Currency', key: 'currency', samples: ['USD', 'USD'] },
    { header: 'Billing Cycle', key: 'billingCycle', samples: ['monthly', 'monthly'] },
    { header: 'Billing Day', key: 'billingDay', samples: [1, 5] },
    { header: 'Payment Due Days', key: 'paymentDueDays', samples: [7, 7] },
    { header: 'Security Deposit', key: 'securityDeposit', samples: [1000, 1500] },
    { header: 'Notes', key: 'notes', samples: ['Sample lease', ''] },
  ],
  lead: [
    { header: 'PropertyCode', key: 'propertyCode', samples: ['PRP-001', 'PRP-001'] },
    { header: 'LeadNumber', key: 'leadNumber', required: true, samples: ['LD-2026-001', 'LD-2026-002'] },
    { header: 'TenantCode', key: 'tenantCode', samples: ['TEN-001', 'TEN-002'] },
    { header: 'TenantName', key: 'tenantName', required: true, samples: ['John Doe', 'Acme Corp'] },
    { header: 'Email', key: 'email', samples: ['john@example.com', 'info@acme.com'] },
    { header: 'Phone', key: 'phone', samples: ['012345678', '019876543'] },
    { header: 'Mobile', key: 'mobile', samples: ['09123456789', '09987654321'] },
    { header: 'unt_type', key: 'unitType', samples: ['1br', 'commercial'] },
    { header: 'MinAreaSqft', key: 'minAreaSqft', samples: [500, 1000] },
    { header: 'MaxAreaSqft', key: 'maxAreaSqft', samples: [800, 1500] },
    { header: 'MinBudget', key: 'minBudget', samples: [1000, 2500] },
    { header: 'MaxBudget', key: 'maxBudget', samples: [1500, 3500] },
    { header: 'LeaseTermsMonth', key: 'leaseTermMonths', samples: [12, 24] },
    { header: 'Address', key: 'address', samples: ['123 Main St', '456 Business Rd'] },
    { header: 'door type', key: 'doorType', samples: ['glass_door', 'roller_shutter'] },
    { header: 'productplan', key: 'productPlan', samples: ['plan_a', 'plan_b'] },
    { header: 'applicantDate', key: 'applicantDate', samples: ['2026-01-15', '2026-02-01'] },
  ],
};

// ── Cell helpers ─────────────────────────────────────────────────────────────

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // ExcelJS dates are UTC-anchored.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('result' in o) return cellToString(o.result as ExcelJS.CellValue);
    if ('text' in o) return String(o.text ?? '').trim();
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('').trim();
    return '';
  }
  return String(v).trim();
}

function num(raw: string): number | null {
  if (raw === '') return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE_RE.test(s) && !isNaN(new Date(s).getTime());
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_');

// ── Core ─────────────────────────────────────────────────────────────────────

function assertType(type: string): asserts type is ImportType {
  if (!IMPORT_TYPES.includes(type as ImportType)) {
    throw AppError.badRequest(`Unknown import type "${type}"`, 'INVALID_IMPORT_TYPE');
  }
}

async function parseWorkbook(type: ImportType, buffer: Buffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw AppError.badRequest('File is not a valid .xlsx workbook', 'INVALID_FILE');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw AppError.badRequest('Workbook has no sheets', 'EMPTY_FILE');

  const cols = COLUMNS[type];
  const headerRow = sheet.getRow(1);
  const colIndex: Record<string, number> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
  headerRow.eachCell((cell, idx) => {
    const rawH = cellToString(cell.value);
    const h = rawH.toLowerCase();
    const nh = normalize(rawH);
    const def = cols.find((c) => {
      const ch = c.header.toLowerCase();
      if (ch === h || normalize(c.header) === nh) return true;
      if (c.key === 'unitType' && ['unttype', 'unittype'].includes(nh)) return true;
      if (c.key === 'doorType' && nh === 'doortype') return true;
      if (c.key === 'productPlan' && nh === 'productplan') return true;
      if (c.key === 'applicantDate' && nh === 'applicantdate') return true;
      return false;
    });
    if (def) colIndex[def.key] = idx;
  });
  const missing = cols.filter((c) => c.required && !colIndex[c.key]).map((c) => c.header);
  if (missing.length) {
    throw AppError.badRequest(
      `Wrong file format for this import type. Missing column(s): ${missing.join(', ')}`,
      'MISSING_COLUMNS',
    );
  }

  const rows: ParsedRow[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const data: Record<string, string> = {};
    let hasData = false;
    for (const c of cols) {
      const v = colIndex[c.key] ? cellToString(row.getCell(colIndex[c.key]).value) : '';
      data[c.key] = v;
      if (v.trim() !== '') hasData = true;
    }
    // Skip completely blank rows
    if (hasData) {
      rows.push({ rowNo: rowNo - 1, data }); // header is Excel row 1, so first data row is #1
    }
  });
  if (rows.length === 0) throw AppError.badRequest('The file contains no data rows', 'EMPTY_FILE');
  return rows;
}

function checkRequired(type: ImportType, d: Record<string, string>): string[] {
  return COLUMNS[type].filter((c) => c.required && !d[c.key]).map((c) => `${c.header} is required`);
}

function checkNumbers(d: Record<string, string>, keys: string[], labels: Record<string, string>): string[] {
  const errs: string[] = [];
  for (const k of keys) {
    if (d[k] !== '' && Number.isNaN(num(d[k]))) errs.push(`${labels[k]} must be a number`);
  }
  return errs;
}

// Per-type validation. `ctx` holds lookups loaded once per request.
async function validateRows(type: ImportType, propertyId: string, companyId: string, rows: ParsedRow[]): Promise<PreviewRow[]> {
  const out: PreviewRow[] = [];

  if (type === 'meter') {
    const [floors, existing, property, units] = await Promise.all([
      prisma.floorSetup.findMany({ where: { propertyId }, select: { id: true, floorLabel: true, floorNumber: true } }),
      prisma.meterSetup.findMany({ where: { propertyId }, select: { meterNo: true, floorId: true, category: true } }),
      prisma.property.findUnique({ where: { id: propertyId }, select: { code: true } }),
      prisma.unit.findMany({ where: { propertyId, deletedAt: null }, select: { unitNumber: true } }),
    ]);
    const unitSet = new Set(units.map((u) => u.unitNumber.toLowerCase()));
    const knownNos = new Set(existing.map((m) => m.meterNo.toLowerCase()));
    const knownKeys = new Set(existing.map((m) => meterKey(m.meterNo, m.floorId, m.category)));
    const fileNos = new Set(rows.map((r) => r.data.meterNo.toLowerCase()));
    const seenKeys = new Set<string>();
    for (const r of rows) {
      const d = r.data;
      const errors = checkRequired(type, d);
      const warnings: string[] = [];
      d.meterType = norm(d.meterType);
      d.category = norm(d.category);
      if (d.usageType) d.usageType = norm(d.usageType);
      if (d.calculationType) d.calculationType = norm(d.calculationType);
      if (d.propertyCode && property?.code && d.propertyCode.toLowerCase() !== property.code.toLowerCase()) {
        errors.push(`Property Code "${d.propertyCode}" does not match the selected property (${property.code})`);
      }
      if (d.meterType && !METER_TYPES.includes(d.meterType)) errors.push(`Meter Type must be one of: ${METER_TYPES.join(', ')}`);
      if (d.category && !METER_CATEGORIES.includes(d.category)) errors.push(`Category must be one of: ${METER_CATEGORIES.join(', ')}`);
      if (d.usageType && !USAGE_TYPES.includes(d.usageType)) errors.push(`Usage Type must be one of: ${USAGE_TYPES.join(', ')}`);
      if (d.calculationType && !CALC_TYPES.includes(d.calculationType)) errors.push(`Calculation Type must be one of: ${CALC_TYPES.join(', ')}`);
      errors.push(...checkNumbers(d, ['maintenanceFee', 'rate'], { maintenanceFee: 'Maintenance Fee', rate: 'Rate' }));
      const floor = d.floor ? resolveFloor(floors, d.floor) : null;
      if (d.floor && !floor) errors.push(`Floor "${d.floor}" not found in Floor Setup`);
      if (d.meterType === 'sub_meter') {
        if (!d.mainMeter) errors.push('Main Meter is required for sub_meter');
        else if (!knownNos.has(d.mainMeter.toLowerCase()) && !fileNos.has(d.mainMeter.toLowerCase())) {
          errors.push(`Main Meter "${d.mainMeter}" not found`);
        }
      }
      if (d.unitNumber && !unitSet.has(d.unitNumber.toLowerCase())) {
        warnings.push(`Unit "${d.unitNumber}" not found - unit link will be skipped`);
      }

      let status: PreviewRow['status'] = errors.length ? 'error' : 'valid';
      if (status === 'valid' && d.meterNo && d.category) {
        const key = meterKey(d.meterNo, floor?.id ?? null, d.category);
        if (knownKeys.has(key) || seenKeys.has(key)) {
          status = 'skip';
          warnings.unshift('Meter No + Floor + Category already exists - insert will be skipped');
        }
        seenKeys.add(key);
      }
      out.push({ rowNo: r.rowNo, data: d, status, errors: status === 'error' ? errors : warnings });
    }
    return out;
  }

  if (type === 'unit') {
    const [types, existing] = await Promise.all([
      prisma.unitType.findMany({ where: { isActive: true }, select: { code: true, name: true } }),
      prisma.unit.findMany({ where: { propertyId, deletedAt: null }, select: { unitNumber: true } }),
    ]);
    const typeMap = new Map<string, string>();
    types.forEach((t) => { typeMap.set(t.code.toLowerCase(), t.code); typeMap.set(t.name.toLowerCase(), t.code); });
    const known = new Set(existing.map((u) => u.unitNumber.toLowerCase()));
    const seen = new Set<string>();
    for (const r of rows) {
      const d = r.data;
      const errors = checkRequired(type, d);
      if (d.unitType) {
        const code = typeMap.get(d.unitType.toLowerCase());
        if (!code) errors.push(`Unit Type "${d.unitType}" not found`);
        else d.unitType = code;
      }
      if (d.currency && !/^[A-Za-z]{3}$/.test(d.currency)) errors.push('Currency must be a 3-letter code');
      errors.push(...checkNumbers(d, ['floorNumber', 'areaSqft', 'bedroomCount', 'bathroomCount', 'rate'], {
        floorNumber: 'Floor Number', areaSqft: 'Area Sqft', bedroomCount: 'Bedrooms', bathroomCount: 'Bathrooms', rate: 'Rate',
      }));
      if (d.unitNumber) {
        const k = d.unitNumber.toLowerCase();
        if (known.has(k)) errors.push(`Unit Number "${d.unitNumber}" already exists`);
        else if (seen.has(k)) errors.push(`Unit Number "${d.unitNumber}" is duplicated in the file`);
        seen.add(k);
      }
      out.push({ rowNo: r.rowNo, data: d, status: errors.length ? 'error' : 'valid', errors });
    }
    return out;
  }

  if (type === 'tenant') {
    const [property, existing] = await Promise.all([
      prisma.property.findUnique({ where: { id: propertyId }, select: { code: true } }),
      prisma.tenant.findMany({ where: { companyId, deletedAt: null }, select: { code: true, firstName: true } }),
    ]);
    const known = new Set<string>();
    existing.forEach((t) => {
      if (t.code) known.add(t.code.trim().toLowerCase());
      if (t.firstName) known.add(t.firstName.trim().toLowerCase()); // individual Code was historically stored here
    });
    const seen = new Set<string>();
    for (const r of rows) {
      const d = r.data;
      const errors = checkRequired(type, d);
      if (d.tenantType) {
        const t = norm(d.tenantType);
        d.tenantType = t === 'corporate' ? 'company' : t;
        if (!['individual', 'company'].includes(d.tenantType)) errors.push('Tenant Type must be individual or company');
      }
      if (d.propertyCode && property?.code && d.propertyCode.toLowerCase() !== property.code.toLowerCase()) {
        errors.push(`Property Code "${d.propertyCode}" does not match the selected property (${property.code})`);
      }
      if (d.dob && !validDate(d.dob)) errors.push('DOB must be a date (YYYY-MM-DD)');
      if (d.gender) {
        const g = d.gender.trim().toLowerCase();
        d.gender = g === 'm' ? 'male' : g === 'f' ? 'female' : g;
        if (!['male', 'female', 'other'].includes(d.gender)) errors.push('Gender must be male, female or other');
      }
      let status: PreviewRow['status'] = errors.length ? 'error' : 'valid';
      const notes: string[] = [];
      if (status === 'valid') {
        const k = d.code.trim().toLowerCase();
        if (known.has(k)) { status = 'skip'; notes.push('Code already exists - insert will be skipped'); }
        else if (seen.has(k)) { status = 'skip'; notes.push('Code duplicated in file - insert will be skipped'); }
        seen.add(k);
      }
      out.push({ rowNo: r.rowNo, data: d, status, errors: status === 'error' ? errors : notes });
    }
    return out;
  }

  if (type === 'lead') {
    const [property, existingLeads, properties] = await Promise.all([
      prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, code: true } }),
      prisma.lead.findMany({
        where: { companyId, deletedAt: null, leadNumber: { not: null } },
        select: { leadNumber: true },
      }),
      prisma.property.findMany({ where: { companyId }, select: { id: true, code: true } }),
    ]);
    const known = new Set(existingLeads.map((l) => l.leadNumber!.trim().toLowerCase()));
    const seen = new Set<string>();
    const propMap = new Map(properties.filter((p) => p.code).map((p) => [p.code!.toLowerCase(), p.id]));

    for (const r of rows) {
      const d = r.data;
      const errors = checkRequired(type, d);
      if (d.propertyCode) {
        const targetPropId = propMap.get(d.propertyCode.toLowerCase());
        if (!targetPropId) {
          errors.push(`Property Code "${d.propertyCode}" not found`);
        } else if (property?.code && d.propertyCode.toLowerCase() !== property.code.toLowerCase()) {
          errors.push(`Property Code "${d.propertyCode}" does not match the selected property (${property.code})`);
        }
      }
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
        errors.push(`Invalid email format "${d.email}"`);
      }
      errors.push(...checkNumbers(d, ['minAreaSqft', 'maxAreaSqft', 'minBudget', 'maxBudget', 'leaseTermMonths'], {
        minAreaSqft: 'MinAreaSqft',
        maxAreaSqft: 'MaxAreaSqft',
        minBudget: 'MinBudget',
        maxBudget: 'MaxBudget',
        leaseTermMonths: 'LeaseTermsMonth',
      }));
      if (d.applicantDate && !validDate(d.applicantDate)) {
        errors.push('applicantDate must be a date (YYYY-MM-DD)');
      }

      let status: PreviewRow['status'] = errors.length ? 'error' : 'valid';
      const notes: string[] = [];
      if (status === 'valid' && d.leadNumber) {
        const k = d.leadNumber.trim().toLowerCase();
        if (known.has(k)) {
          status = 'skip';
          notes.push('LeadNumber already exists - insert will be skipped');
        } else if (seen.has(k)) {
          status = 'skip';
          notes.push('LeadNumber duplicated in file - insert will be skipped');
        }
        seen.add(k);
      }
      out.push({ rowNo: r.rowNo, data: d, status, errors: status === 'error' ? errors : notes });
    }
    return out;
  }

  // lease
  const [units, tenants] = await Promise.all([
    prisma.unit.findMany({ where: { propertyId, deletedAt: null }, select: { unitNumber: true, status: true } }),
    prisma.tenant.findMany({ where: { companyId, code: { not: null } }, select: { code: true, isBlacklisted: true } }),
  ]);
  const unitMap = new Map(units.map((u) => [u.unitNumber.toLowerCase(), u.status]));
  const tenantMap = new Map(tenants.map((t) => [t.code!.toLowerCase(), t.isBlacklisted]));
  for (const r of rows) {
    const d = r.data;
    const errors = checkRequired(type, d);
    if (d.unitNumber) {
      const st = unitMap.get(d.unitNumber.toLowerCase());
      if (st === undefined) errors.push(`Unit "${d.unitNumber}" not found in this property`);
      else if (!['available', 'reserved'].includes(st)) errors.push(`Unit "${d.unitNumber}" is ${st}`);
    }
    if (d.tenantCode) {
      const bl = tenantMap.get(d.tenantCode.toLowerCase());
      if (bl === undefined) errors.push(`Tenant "${d.tenantCode}" not found`);
      else if (bl) errors.push(`Tenant "${d.tenantCode}" is blacklisted`);
    }
    if (d.startDate && !validDate(d.startDate)) errors.push('Start Date must be YYYY-MM-DD');
    if (d.endDate && !validDate(d.endDate)) errors.push('End Date must be YYYY-MM-DD');
    if (validDate(d.startDate) && validDate(d.endDate) && new Date(d.endDate) <= new Date(d.startDate)) {
      errors.push('End Date must be after Start Date');
    }
    if (d.billingCycle) {
      d.billingCycle = norm(d.billingCycle);
      if (!BILLING_CYCLES.includes(d.billingCycle)) errors.push(`Billing Cycle must be one of: ${BILLING_CYCLES.join(', ')}`);
    }
    errors.push(...checkNumbers(d, ['rentAmount', 'billingDay', 'paymentDueDays', 'securityDeposit'], {
      rentAmount: 'Rent Amount', billingDay: 'Billing Day', paymentDueDays: 'Payment Due Days', securityDeposit: 'Security Deposit',
    }));
    out.push({ rowNo: r.rowNo, data: d, status: errors.length ? 'error' : 'valid', errors });
  }
  return out;
}

const optNum = (s: string) => (s === '' ? undefined : (num(s) as number));

export const generalImportService = {
  assertType,

  async buildSample(type: string): Promise<{ buffer: Buffer; filename: string }> {
    assertType(type);
    const cols = COLUMNS[type];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${type[0].toUpperCase()}${type.slice(1)} Import`);
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 4) }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell, idx) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cols[idx - 1].required ? 'FF1D4ED8' : 'FF64748B' } };
    });
    for (let i = 0; i < 2; i++) {
      ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.samples[i]])));
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, filename: `${type}-import-sample.xlsx` };
  },

  async preview(type: string, propertyId: string, companyId: string, buffer: Buffer) {
    assertType(type);
    const rows = await validateRows(type, propertyId, companyId, await parseWorkbook(type, buffer));
    const validCount = rows.filter((r) => r.status === 'valid').length;
    const skipCount = rows.filter((r) => r.status === 'skip').length;
    return {
      type,
      columns: COLUMNS[type].map((c) => ({ key: c.key, header: c.header })),
      rows,
      total: rows.length,
      validCount,
      skipCount,
      errorCount: rows.length - validCount - skipCount,
    };
  },

  async import(type: string, propertyId: string, companyId: string, userId: string, buffer: Buffer) {
    assertType(type);
    const rows = await validateRows(type, propertyId, companyId, await parseWorkbook(type, buffer));
    const failed: { rowNo: number; errors: string[] }[] = rows
      .filter((r) => r.status === 'error')
      .map((r) => ({ rowNo: r.rowNo, errors: r.errors }));
    // 'skip' rows (meter already exists) still flow through so their unit link can be made.
    const valid = rows.filter((r) => r.status !== 'error');
    let imported = 0;
    let skipped = 0;
    let linked = 0;
    let linkSkipped = 0;
    const notes: { rowNo: number; message: string }[] = [];

    if (type === 'meter') {
      const floors = await prisma.floorSetup.findMany({ where: { propertyId }, select: { id: true, floorLabel: true, floorNumber: true } });
      const existing = await prisma.meterSetup.findMany({ where: { propertyId }, select: { id: true, meterNo: true, floorId: true, category: true } });
      const idByNo = new Map(existing.map((m) => [m.meterNo.toLowerCase(), m.id]));
      const keys = new Set(existing.map((m) => meterKey(m.meterNo, m.floorId, m.category)));
      const unitIdByNo = new Map(
        (await prisma.unit.findMany({ where: { propertyId, deletedAt: null }, select: { id: true, unitNumber: true } }))
          .map((u) => [u.unitNumber.toLowerCase(), u.id]),
      );
      // Main meters first so sub meters can reference ones created in the same file.
      const ordered = [...valid].sort((a, b) => Number(a.data.meterType === 'sub_meter') - Number(b.data.meterType === 'sub_meter'));
      for (const r of ordered) {
        const d = r.data;
        const fId = resolveFloor(floors, d.floor)?.id ?? null;
        const key = meterKey(d.meterNo, fId, d.category);
        try {
          if (keys.has(key)) {
            skipped++; // same Meter No + Floor + Category already in meter_setups
          } else {
            const created = await prisma.meterSetup.create({
              data: {
                companyId, propertyId,
                floorId: fId,
                meterType: d.meterType,
                meterNo: d.meterNo,
                mainMeterId: d.meterType === 'sub_meter' ? idByNo.get(d.mainMeter.toLowerCase()) ?? null : null,
                category: d.category,
                maintenanceFee: optNum(d.maintenanceFee),
                usageType: d.usageType || null,
                rate: optNum(d.rate),
                calculationType: d.calculationType || 'per_unit',
              },
            });
            keys.add(key);
            idByNo.set(d.meterNo.toLowerCase(), created.id);
            imported++;
          }
        } catch (e) {
          failed.push({ rowNo: r.rowNo, errors: [(e as Error).message] });
          continue;
        }

        // Unit Number present: connect the meter to the unit through utility_meters.
        if (d.unitNumber) {
          const uId = unitIdByNo.get(d.unitNumber.toLowerCase());
          if (!uId) {
            linkSkipped++;
            notes.push({ rowNo: r.rowNo, message: `Unit "${d.unitNumber}" not found - unit link skipped` });
            continue;
          }
          try {
            await metersService.create(uId, propertyId, companyId, {
              meterType: d.category === 'water' || d.meterType === 'water_meter' ? 'water' : 'electricity',
              meterSerialNo: d.meterNo,
              ratePerUnit: optNum(d.rate),
            });
            linked++;
          } catch (e) {
            linkSkipped++;
            notes.push({ rowNo: r.rowNo, message: `Unit link skipped: ${(e as Error).message}` });
          }
        }
      }
    } else if (type === 'unit') {
      for (const r of valid) {
        const d = r.data;
        try {
          await unitsService.create(propertyId, companyId, {
            unitNumber: d.unitNumber,
            unitType: d.unitType,
            floorNumber: optNum(d.floorNumber),
            floorLabel: d.floorLabel || undefined,
            zone: d.zone || undefined,
            areaSqft: optNum(d.areaSqft),
            bedroomCount: optNum(d.bedroomCount) ?? 0,
            bathroomCount: optNum(d.bathroomCount) ?? 0,
            furnishing: d.furnishing || 'unfurnished',
            rate: optNum(d.rate),
            currency: d.currency.toUpperCase(),
            description: d.description || undefined,
          }, userId);
          imported++;
        } catch (e) {
          failed.push({ rowNo: r.rowNo, errors: [(e as Error).message] });
        }
      }
    } else if (type === 'tenant') {
      const existing = await prisma.tenant.findMany({
        where: { companyId, deletedAt: null },
        select: { code: true, firstName: true },
      });
      const known = new Set<string>();
      existing.forEach((t) => {
        if (t.code) known.add(t.code.trim().toLowerCase());
        if (t.firstName) known.add(t.firstName.trim().toLowerCase());
      });
      for (const r of valid) {
        const d = r.data;
        const code = d.code.trim();
        const k = code.toLowerCase();
        if (known.has(k)) { skipped++; continue; }
        const isCompany = d.tenantType === 'company';
        try {
          await prisma.tenant.create({
            data: {
              companyId,
              propertyId,
              tenantType: d.tenantType,
              code,
              ...(isCompany
                ? { companyName: d.name.trim() }
                : { firstName: code, lastName: d.name.trim() }),
              dateOfBirth: d.dob ? new Date(d.dob) : null,
              gender: d.gender || null,
              mobile: d.mobile || null,
              addressLine1: d.address || null,
            },
          });
          known.add(k);
          imported++;
        } catch (e) {
          failed.push({ rowNo: r.rowNo, errors: [(e as Error).message] });
        }
      }
    } else if (type === 'lead') {
      const [existingLeads, tenants, properties] = await Promise.all([
        prisma.lead.findMany({
          where: { companyId, deletedAt: null, leadNumber: { not: null } },
          select: { leadNumber: true },
        }),
        prisma.tenant.findMany({
          where: { companyId, deletedAt: null },
          select: { id: true, code: true, firstName: true },
        }),
        prisma.property.findMany({
          where: { companyId },
          select: { id: true, code: true },
        }),
      ]);
      const known = new Set(existingLeads.map((l) => l.leadNumber!.trim().toLowerCase()));
      const tenantMap = new Map<string, string>();
      tenants.forEach((t) => {
        if (t.code) tenantMap.set(t.code.trim().toLowerCase(), t.id);
        if (t.firstName) tenantMap.set(t.firstName.trim().toLowerCase(), t.id);
      });
      const propMap = new Map<string, string>();
      properties.forEach((p) => {
        if (p.code) propMap.set(p.code.trim().toLowerCase(), p.id);
      });

      for (const r of valid) {
        const d = r.data;
        const leadNum = d.leadNumber.trim();
        const k = leadNum.toLowerCase();
        if (known.has(k)) {
          skipped++;
          continue;
        }

        const targetPropertyId = (d.propertyCode && propMap.get(d.propertyCode.trim().toLowerCase())) || propertyId;
        const matchedTenantId = d.tenantCode ? tenantMap.get(d.tenantCode.trim().toLowerCase()) : undefined;

        const loiDetails: Record<string, unknown> = {};
        if (d.address) loiDetails.address = d.address;
        if (d.doorType) loiDetails.doorType = d.doorType;
        if (d.productPlan) loiDetails.productPlan = d.productPlan;
        if (d.applicantDate) loiDetails.applicantDate = d.applicantDate;
        if (d.tenantCode) loiDetails.tenantCode = d.tenantCode;
        if (d.tenantName) loiDetails.tenantName = d.tenantName;

        try {
          const lead = await prisma.lead.create({
            data: {
              companyId,
              propertyId: targetPropertyId,
              leadNumber: leadNum,
              firstName: d.tenantCode || null,
              lastName: d.tenantName || null,
              email: d.email || null,
              phone: d.phone || null,
              mobile: d.mobile || null,
              unitTypePreference: d.unitType || null,
              minAreaSqft: optNum(d.minAreaSqft),
              maxAreaSqft: optNum(d.maxAreaSqft),
              budgetMin: optNum(d.minBudget),
              budgetMax: optNum(d.maxBudget),
              leaseTermMonths: optNum(d.leaseTermMonths),
              loiDetails: Object.keys(loiDetails).length > 0 ? (loiDetails as any) : undefined,
              stage: 'new',
              priority: 'medium',
              source: 'import',
              convertedTenantId: matchedTenantId || null,
            },
          });
          try {
            await prisma.leadActivity.create({
              data: {
                leadId: lead.id,
                activityType: 'note',
                description: 'Lead imported via General Import',
                performedBy: userId,
              },
            });
          } catch {
            // Non-critical
          }
          known.add(k);
          imported++;
        } catch (e) {
          failed.push({ rowNo: r.rowNo, errors: [(e as Error).message] });
        }
      }
    } else {
      const [units, tenants] = await Promise.all([
        prisma.unit.findMany({ where: { propertyId, deletedAt: null }, select: { id: true, unitNumber: true } }),
        prisma.tenant.findMany({ where: { companyId, code: { not: null } }, select: { id: true, code: true } }),
      ]);
      const unitId = new Map(units.map((u) => [u.unitNumber.toLowerCase(), u.id]));
      const tenantId = new Map(tenants.map((t) => [t.code!.toLowerCase(), t.id]));
      for (const r of valid) {
        const d = r.data;
        try {
          await leasesService.create(companyId, {
            propertyId,
            unitId: unitId.get(d.unitNumber.toLowerCase()),
            tenantId: tenantId.get(d.tenantCode.toLowerCase()),
            startDate: d.startDate,
            endDate: d.endDate,
            rentAmount: num(d.rentAmount),
            ...(d.currency ? { currency: d.currency.toUpperCase() } : {}),
            ...(d.billingCycle ? { billingCycle: d.billingCycle } : {}),
            ...(d.billingDay ? { billingDay: num(d.billingDay) } : {}),
            ...(d.paymentDueDays ? { paymentDueDays: num(d.paymentDueDays) } : {}),
            ...(d.securityDeposit ? { securityDeposit: num(d.securityDeposit) } : {}),
            ...(d.notes ? { notes: d.notes } : {}),
          }, userId);
          imported++;
        } catch (e) {
          failed.push({ rowNo: r.rowNo, errors: [(e as Error).message] });
        }
      }
    }

    failed.sort((a, b) => a.rowNo - b.rowNo);
    return { type, total: rows.length, imported, skipped, linked, linkSkipped, notes, failed };
  },
};
