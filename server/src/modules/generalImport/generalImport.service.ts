import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { unitsService, metersService } from '../units/units.service';
import { calcLeaseTermMonths, nextLeaseNumber } from '../leases/services/helpers';
import { billingSchedulesService } from '../billing/billingSchedules.service';

export type ImportType = 'meter' | 'unit' | 'lease' | 'tenant' | 'lead' | 'invoice' | 'charge';
export const IMPORT_TYPES: ImportType[] = ['meter', 'unit', 'lease', 'tenant', 'lead', 'invoice', 'charge'];

/**
 * PostgreSQL prepared statements support at most 32,767 bind variables.
 * Chunking `in` array filters well below that threshold prevents Prisma P2035 errors on large files.
 */
const BIND_CHUNK_SIZE = 5000;

function chunkArray<T>(items: T[], size = BIND_CHUNK_SIZE): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function findInvoicesByNumbers(companyId: string, invoiceNumbers: string[]) {
  if (invoiceNumbers.length === 0) return [];
  const out: {
    invoiceNumber: string;
    tenantId: string;
    tenant: { id: string; code: string | null; firstName: string | null; lastName: string | null; companyName: string | null } | null;
  }[] = [];
  for (const chunk of chunkArray(invoiceNumbers)) {
    const batch = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceNumber: { in: chunk, mode: 'insensitive' },
      },
      select: {
        invoiceNumber: true,
        tenantId: true,
        tenant: { select: { id: true, code: true, firstName: true, lastName: true, companyName: true } },
      },
    });
    out.push(...batch);
  }
  return out;
}

async function findTenantsByCodes(companyId: string, tenantCodes: string[]) {
  if (tenantCodes.length === 0) return [];
  const out: {
    id: string;
    code: string | null;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    isBlacklisted: boolean;
  }[] = [];
  for (const chunk of chunkArray(tenantCodes)) {
    const batch = await prisma.tenant.findMany({
      where: {
        companyId,
        deletedAt: null,
        code: { in: chunk, mode: 'insensitive' },
      },
      select: { id: true, code: true, firstName: true, lastName: true, companyName: true, isBlacklisted: true },
    });
    out.push(...batch);
  }
  return out;
}

async function findUnitsByNumbers(unitCandidates: string[]) {
  if (unitCandidates.length === 0) return [];
  const out: { id: string; propertyId: string; unitNumber: string }[] = [];
  for (const chunk of chunkArray(unitCandidates)) {
    const batch = await prisma.unit.findMany({
      where: {
        deletedAt: null,
        unitNumber: { in: chunk, mode: 'insensitive' },
      },
      select: { id: true, propertyId: true, unitNumber: true },
    });
    out.push(...batch);
  }
  return out;
}

async function findActiveLeasesByUnitIds(companyId: string, unitIds: string[]) {
  if (unitIds.length === 0) return [];
  const out: { id: string; tenantId: string; unitId: string }[] = [];
  for (const chunk of chunkArray(unitIds)) {
    const batch = await prisma.lease.findMany({
      where: {
        companyId,
        deletedAt: null,
        unitId: { in: chunk },
        status: { in: ['active', 'draft', 'pending'] },
      },
      select: { id: true, tenantId: true, unitId: true },
    });
    out.push(...batch);
  }
  return out;
}

interface LeaseImportContext {
  units: { id: string; unitNumber: string; floorNumber: number | null; floorLabel: string | null; propertyId: string; status: string }[];
  tenants: { id: string; code: string | null; firstName: string | null; lastName: string | null; companyName: string | null; isBlacklisted: boolean }[];
  properties: { id: string; code: string | null; name: string }[];
  existingLeases: { leaseNumber: string; tenantId: string }[];
  chargeTypes: { id: string; code: string; name: string; category: string }[];
  floorSetups: { propertyId: string; floorNumber: number; floorLabel: string }[];
  knownLeaseNumbers: Set<string>;
  knownLeaseTenant: Set<string>;
  propByCode: Map<string, string>;
  propByName: Map<string, string>;
  tenantMap: Map<string, LeaseImportContext['tenants'][number]>;
  tenantByName: Map<string, LeaseImportContext['tenants'][number]>;
  unitMap: Map<string, LeaseImportContext['units'][number]>;
  chargeTypeByCode: Map<string, LeaseImportContext['chargeTypes'][number]>;
}

async function loadLeaseImportContext(companyId: string, includeFloors: boolean): Promise<LeaseImportContext> {
  const [units, tenants, properties, existingLeases, chargeTypes, floorSetups] = await Promise.all([
    prisma.unit.findMany({
      where: { property: { companyId }, deletedAt: null },
      select: { id: true, unitNumber: true, floorNumber: true, floorLabel: true, propertyId: true, status: true },
    }),
    prisma.tenant.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, code: true, firstName: true, lastName: true, companyName: true, isBlacklisted: true },
    }),
    prisma.property.findMany({ where: { companyId }, select: { id: true, code: true, name: true } }),
    prisma.lease.findMany({
      where: { companyId, deletedAt: null },
      select: { leaseNumber: true, tenantId: true },
    }),
    prisma.chargeType.findMany({
      where: { OR: [{ companyId }, { companyId: null }], isActive: true },
      select: { id: true, code: true, name: true, category: true },
    }),
    includeFloors
      ? prisma.floorSetup.findMany({
          where: { property: { companyId } },
          select: { propertyId: true, floorNumber: true, floorLabel: true },
        })
      : Promise.resolve([]),
  ]);

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const knownLeaseNumbers = new Set<string>();
  const knownLeaseTenant = new Set<string>();
  for (const l of existingLeases) {
    if (!l.leaseNumber) continue;
    const numStr = l.leaseNumber.trim().toLowerCase();
    knownLeaseNumbers.add(numStr);
    if (l.tenantId) {
      knownLeaseTenant.add(`${numStr}|${l.tenantId.toLowerCase()}`);
      const t = tenantById.get(l.tenantId);
      if (t) {
        if (t.code) knownLeaseTenant.add(`${numStr}|${t.code.trim().toLowerCase()}`);
        if (t.companyName) knownLeaseTenant.add(`${numStr}|${t.companyName.trim().toLowerCase()}`);
        const fullName = `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase();
        if (fullName) knownLeaseTenant.add(`${numStr}|${fullName}`);
        if (t.firstName) knownLeaseTenant.add(`${numStr}|${t.firstName.trim().toLowerCase()}`);
      }
    }
  }

  const propByCode = new Map(properties.filter((p) => p.code).map((p) => [p.code!.toLowerCase(), p.id]));
  const propByName = new Map(properties.map((p) => [p.name.toLowerCase(), p.id]));
  const tenantMap = new Map(tenants.filter((t) => t.code).map((t) => [t.code!.toLowerCase(), t]));
  const tenantByName = new Map(tenants.map((t) => [t.firstName ? t.firstName.toLowerCase() : '', t]));
  for (const t of tenants) {
    if (t.companyName) tenantByName.set(t.companyName.toLowerCase(), t);
    const full = `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase();
    if (full) tenantByName.set(full, t);
  }

  const unitMap = new Map(units.map((u) => [`${u.propertyId}|${u.unitNumber.toLowerCase()}`, u]));
  const chargeTypeByCode = new Map(chargeTypes.map((c) => [c.code.trim().toLowerCase(), c]));

  return {
    units,
    tenants,
    properties,
    existingLeases,
    chargeTypes,
    floorSetups,
    knownLeaseNumbers,
    knownLeaseTenant,
    propByCode,
    propByName,
    tenantMap,
    tenantByName,
    unitMap,
    chargeTypeByCode,
  };
}

async function findUnitChargesByUnitIds(unitIds: string[]) {
  if (unitIds.length === 0) return [];
  const out: { id: string; unitId: string; chargeTypeId: string; amount: any }[] = [];
  for (const chunk of chunkArray(unitIds)) {
    const batch = await prisma.unitCharge.findMany({
      where: { unitId: { in: chunk } },
      select: { id: true, unitId: true, chargeTypeId: true, amount: true },
    });
    out.push(...batch);
  }
  return out;
}

type LeaseCandidateInvoiceLine = {
  id: string;
  invoiceId: string;
  chargeTypeId: string;
  description: string;
  quantity: any;
  unitPrice: any;
  amount: any;
  lineTotal: any;
  periodFrom: Date | null;
  periodTo: Date | null;
  chargeType: { id: string; code: string; name: string; category: string } | null;
};

type LeaseCandidateInvoice = {
  id: string;
  invoiceNumber: string;
  secondRef: string | null;
  notes: string | null;
  leaseId: string | null;
  unitId: string | null;
  tenantId: string;
  invoiceDate: Date;
  periodFrom: Date | null;
  periodTo: Date | null;
  status: string;
  totalAmount: any;
  paidAmount: any;
  lines: LeaseCandidateInvoiceLine[];
};

async function findCandidateInvoicesForLeaseImport(
  companyId: string,
  unitIds: string[],
  leaseNumbers: string[],
  validUnitTenantPairs: Set<string>,
  chargeTypeById: Map<string, { id: string; code: string; name: string; category: string }>,
): Promise<LeaseCandidateInvoice[]> {
  if (unitIds.length === 0 && leaseNumbers.length === 0) return [];

  const refLowerSet = new Set(leaseNumbers.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const invById = new Map<string, Omit<LeaseCandidateInvoice, 'lines'>>();
  const invoiceSelect = {
    id: true,
    invoiceNumber: true,
    secondRef: true,
    notes: true,
    leaseId: true,
    unitId: true,
    tenantId: true,
    invoiceDate: true,
    periodFrom: true,
    periodTo: true,
    status: true,
    totalAmount: true,
    paidAmount: true,
  } as const;

  const isRelevantInvoice = (inv: Omit<LeaseCandidateInvoice, 'lines'>) => {
    if (inv.unitId && inv.tenantId && validUnitTenantPairs.has(`${inv.unitId}|${inv.tenantId}`)) {
      return true;
    }
    if (inv.secondRef && refLowerSet.size > 0 && refLowerSet.has(inv.secondRef.trim().toLowerCase())) {
      return true;
    }
    return false;
  };

  for (const uChunk of chunkArray(unitIds, 250)) {
    const batch = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { not: 'void' },
        unitId: { in: uChunk },
      },
      select: invoiceSelect,
    });
    for (const inv of batch) {
      if (isRelevantInvoice(inv)) {
        invById.set(inv.id, inv);
      }
    }
  }

  // Only scan non-unit invoices with a secondRef and match in memory to avoid expensive UPPER(second_ref) IN (...) SQL scans
  if (refLowerSet.size > 0) {
    const refCandidates = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { not: 'void' },
        unitId: null,
        secondRef: { not: null },
      },
      select: invoiceSelect,
    });
    for (const inv of refCandidates) {
      if (inv.secondRef && refLowerSet.has(inv.secondRef.trim().toLowerCase())) {
        invById.set(inv.id, inv);
      }
    }
  }

  const rawInvoices = Array.from(invById.values());
  if (rawInvoices.length === 0) return [];

  const linesByInvoiceId = new Map<string, LeaseCandidateInvoiceLine[]>();
  const rawInvoiceIds = rawInvoices.map((inv) => inv.id);
  for (const idChunk of chunkArray(rawInvoiceIds, 250)) {
    const chunkLines = await prisma.invoiceLine.findMany({
      where: { invoiceId: { in: idChunk } },
      select: {
        id: true,
        invoiceId: true,
        chargeTypeId: true,
        description: true,
        quantity: true,
        unitPrice: true,
        amount: true,
        lineTotal: true,
        periodFrom: true,
        periodTo: true,
      },
    });
    for (const ln of chunkLines) {
      let arr = linesByInvoiceId.get(ln.invoiceId);
      if (!arr) {
        arr = [];
        linesByInvoiceId.set(ln.invoiceId, arr);
      }
      arr.push({
        ...ln,
        chargeType: chargeTypeById.get(ln.chargeTypeId) ?? null,
      });
    }
  }

  return rawInvoices.map((inv) => ({
    ...inv,
    lines: linesByInvoiceId.get(inv.id) || [],
  }));
}

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
    { header: 'Property', key: 'propertyCode', samples: ['PRP-001', 'PRP-001', 'PRP-001'] },
    { header: 'Unit', key: 'unitNumber', required: true, samples: ['A-101', 'A-101', 'A-102'] },
    { header: 'TenantCode', key: 'tenantCode', required: true, samples: ['TEN-001', 'TEN-001', 'TEN-002'] },
    { header: 'LeaseNumber', key: 'leaseNumber', required: true, samples: ['LSE-2026-001', 'LSE-2026-001', 'LSE-2026-002'] },
    { header: 'StartDate', key: 'startDate', required: true, samples: ['2026-01-01', '2026-01-01', '2026-02-01'] },
    { header: 'EndDate', key: 'endDate', required: true, samples: ['2026-12-31', '2026-12-31', '2027-01-31'] },
    { header: 'HandoverDate', key: 'handoverDate', samples: ['2025-12-28', '2025-12-28', '2026-01-25'] },
    { header: 'LeaseTerm', key: 'leaseTermMonths', samples: [12, 12, 12] },
    { header: 'RentAmount', key: 'rentAmount', required: true, samples: [1500, 1500, 2000] },
    { header: 'Currency', key: 'currency', samples: ['USD', 'USD', 'USD'] },
    { header: 'ContractStartDate', key: 'contractStartDate', samples: ['2026-01-01', '2026-01-01', '2026-02-01'] },
    { header: 'ContractEndDate', key: 'contractEndDate', samples: ['2026-12-31', '2026-12-31', '2027-01-31'] },
    { header: 'Status', key: 'status', samples: ['active', 'active', 'draft'] },
    { header: 'Charges Code', key: 'chargesCode', samples: ['CHG-ELEC', 'CHG-WATER', 'CHG-MAINT'] },
    { header: 'Charges Name', key: 'chargesName', samples: ['Electricity Charge', 'Water Charge', 'Maintenance Charge'] },
    { header: 'Charges Amount', key: 'chargesAmount', samples: [100, 50, 150] },
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
  invoice: [
    { header: 'InvoiceDate', key: 'invoiceDate', required: true, samples: ['2026-03-01', '2026-03-01', '2026-03-05'] },
    { header: 'Invoice', key: 'invoiceNumber', required: true, samples: ['INV-2026-001', 'INV-2026-001', 'INV-2026-002'] },
    { header: 'SecondRef', key: 'secondRef', samples: ['REF-001', 'REF-001', 'REF-002'] },
    { header: 'TenantCode', key: 'tenantCode', required: true, samples: ['TEN-001', 'TEN-001', 'TEN-002'] },
    { header: 'TenantName', key: 'tenantName', samples: ['John Smith', 'John Smith', 'Acme Corp'] },
    { header: 'Property', key: 'propertyCode', samples: ['PRP-001', 'PRP-001', 'PRP-001'] },
    { header: 'Floor', key: 'floor', samples: ['1F', '1F', '2F'] },
    { header: 'Unit', key: 'unitNumber', samples: ['A-101', 'A-101', 'A-201'] },
    { header: 'Period', key: 'period', samples: ['2026-03-01 - 2026-03-31', '2026-03-01 - 2026-03-31', '2026-03-01 - 2026-03-31'] },
    { header: 'Currency', key: 'currency', samples: ['USD', 'USD', 'USD'] },
    { header: 'Description', key: 'description', samples: ['Monthly Rent & Electricity', 'Monthly Rent & Electricity', 'Office Space Rental'] },
    { header: 'ChargeType', key: 'chargeType', required: true, samples: ['RENT', 'ELECTRICITY', 'RENT'] },
    { header: 'Qty', key: 'quantity', samples: [1, 100, 1] },
    { header: 'Unit Price', key: 'unitPrice', samples: [1000, 2.5, 2500] },
    { header: 'Tax', key: 'tax', samples: [50, 12.5, 125] },
    { header: 'Total', key: 'total', samples: [1050, 262.5, 2625] },
    { header: 'Paid', key: 'paid', samples: [0, 0, 2625] },
    { header: 'Status', key: 'status', samples: ['issued', 'issued', 'paid'] },
    { header: 'DueDate', key: 'dueDate', required: true, samples: ['2026-03-15', '2026-03-15', '2026-03-20'] },
  ],
  charge: [
    { header: 'Charges Code', key: 'code', required: true, samples: ['CHG-RENT', 'CHG-ELEC', 'CHG-WATER'] },
    { header: 'Charges Name', key: 'name', required: true, samples: ['Rental Charge', 'Electricity Charge', 'Water Charge'] },
    { header: 'Charges Category', key: 'category', required: true, samples: ['rent', 'utility', 'utility'] },
    { header: 'Account Code', key: 'glAccountCode', samples: ['4001', '4900', '4900'] },
    { header: 'Is_Taxable', key: 'isTaxable', samples: ['No', 'Yes', 'No'] },
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

function num(raw?: string | null): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE_RE.test(s) && !isNaN(new Date(s).getTime());
function parseDateStr(s?: string): Date | null {
  if (!s || !s.trim()) return null;
  const clean = s.trim().replace(/\//g, '-');
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}
const norm = (s?: string | null) => (s ? String(s).trim().toLowerCase().replace(/[\s-]+/g, '_') : '');

// ── Core ─────────────────────────────────────────────────────────────────────

function assertType(type: string): asserts type is ImportType {
  const normType = type === 'charges' ? 'charge' : type;
  if (!IMPORT_TYPES.includes(normType as ImportType)) {
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
      if (c.key === 'code' && ['chargescode', 'chargecode', 'code'].includes(nh)) return true;
      if (c.key === 'name' && ['chargesname', 'chargename', 'name', 'chargestitle'].includes(nh)) return true;
      if (c.key === 'category' && ['chargescategory', 'chargecategory', 'category'].includes(nh)) return true;
      if (c.key === 'glAccountCode' && ['accountcode', 'glaccountcode', 'account', 'glaccount', 'glaccountno', 'gl_account_code', 'acctcode'].includes(nh)) return true;
      if (c.key === 'isTaxable' && ['istaxable', 'taxable', 'is_taxable'].includes(nh)) return true;
      if (c.key === 'unitType' && ['unttype', 'unittype'].includes(nh)) return true;
      if (c.key === 'doorType' && nh === 'doortype') return true;
      if (c.key === 'productPlan' && nh === 'productplan') return true;
      if (c.key === 'applicantDate' && nh === 'applicantdate') return true;
      if (c.key === 'invoiceNumber' && ['invoice', 'invoiceno', 'invoicenumber', 'inv', 'invno'].includes(nh)) return true;
      if (c.key === 'secondRef' && ['secondref', 'second_ref', 'secondreference', 'ref2', '2ndref', 'secondrefno'].includes(nh)) return true;
      if (c.key === 'invoiceDate' && ['invoicedate', 'invdate'].includes(nh)) return true;
      if (c.key === 'tenantCode' && ['tenantcode', 'tencode', 'customerno'].includes(nh)) return true;
      if (c.key === 'tenantName' && ['tenantname', 'tenname', 'customername'].includes(nh)) return true;
      if (c.key === 'propertyCode' && ['property', 'propertycode', 'prop', 'propertyfloor'].includes(nh)) return true;
      if (c.key === 'floor' && ['floor', 'floorlabel', 'floornumber'].includes(nh)) return true;
      if (c.key === 'unitNumber' && ['unit', 'unitnumber', 'unitno'].includes(nh)) return true;
      if (c.key === 'period' && ['period', 'billingperiod'].includes(nh)) return true;
      if (c.key === 'unitPeriod' && ['unitperiod'].includes(nh)) return true;
      if (c.key === 'chargeType' && ['chargetype', 'chargetypename'].includes(nh)) return true;
      if (c.key === 'quantity' && ['qty', 'quantity', 'count'].includes(nh)) return true;
      if (c.key === 'unitPrice' && ['unitprice', 'price', 'rate'].includes(nh)) return true;
      if (c.key === 'paid' && ['paid', 'paidamount'].includes(nh)) return true;
      if (c.key === 'status' && ['status', 'paidstatus', 'paymentstatus', 'invoicestatus'].includes(nh)) return true;
      if (c.key === 'leaseNumber' && ['leasenumber', 'leaseno', 'lease_number'].includes(nh)) return true;
      if (c.key === 'handoverDate' && ['handoverdate', 'handover_date'].includes(nh)) return true;
      if (c.key === 'leaseTermMonths' && ['leaseterm', 'leaseterms', 'leasetermmonths', 'term', 'terms', 'qty', 'quantity'].includes(nh)) return true;
      if (c.key === 'contractStartDate' && ['contractstartdate', 'contract_start_date'].includes(nh)) return true;
      if (c.key === 'contractEndDate' && ['contractenddate', 'contract_end_date'].includes(nh)) return true;
      if (c.key === 'startDate' && ['startdate', 'start_date'].includes(nh)) return true;
      if (c.key === 'endDate' && ['enddate', 'end_date'].includes(nh)) return true;
      if (c.key === 'rentAmount' && ['rentamount', 'rent', 'rent_amount'].includes(nh)) return true;
      if (c.key === 'dueDate' && ['duedate', 'due_date'].includes(nh)) return true;
      if (c.key === 'chargesCode' && ['chargescode', 'chargecode', 'chgcode', 'charges_code', 'charge_code'].includes(nh)) return true;
      if (c.key === 'chargesName' && ['chargesname', 'chargename', 'chgname', 'charges_name', 'charge_name', 'chargestitle'].includes(nh)) return true;
      if (c.key === 'chargesAmount' && ['chargesamount', 'chargeamount', 'chgamount', 'charges_amount', 'charge_amount', 'chargesamt'].includes(nh)) return true;
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
async function validateRows(
  type: ImportType,
  propertyId: string,
  companyId: string,
  rows: ParsedRow[],
  preloadedLeaseCtx?: LeaseImportContext,
): Promise<PreviewRow[]> {
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

  if (type === 'invoice') {
    const fileInvNumbers = Array.from(
      new Set(rows.map((r) => (r.data.invoiceNumber || '').trim()).filter(Boolean))
    );
    const fileTenantCodes = Array.from(
      new Set(rows.map((r) => (r.data.tenantCode || '').trim()).filter(Boolean))
    );

    const [existingInvoices, tenants] = await Promise.all([
      findInvoicesByNumbers(companyId, fileInvNumbers),
      findTenantsByCodes(companyId, fileTenantCodes),
    ]);

    const knownInvoices = new Set<string>();
    const knownInvTenant = new Set<string>();
    for (const inv of existingInvoices) {
      const numStr = inv.invoiceNumber.trim().toLowerCase();
      knownInvoices.add(numStr);
      if (inv.tenantId) knownInvTenant.add(`${numStr}|${inv.tenantId.toLowerCase()}`);
      if (inv.tenant?.code) knownInvTenant.add(`${numStr}|${inv.tenant.code.trim().toLowerCase()}`);
      if (inv.tenant?.companyName) knownInvTenant.add(`${numStr}|${inv.tenant.companyName.trim().toLowerCase()}`);
      const fullName = `${inv.tenant?.firstName || ''} ${inv.tenant?.lastName || ''}`.trim().toLowerCase();
      if (fullName) knownInvTenant.add(`${numStr}|${fullName}`);
      if (inv.tenant?.firstName) knownInvTenant.add(`${numStr}|${inv.tenant.firstName.trim().toLowerCase()}`);
    }

    const tenantMap = new Map(tenants.filter((t) => t.code).map((t) => [t.code!.toLowerCase(), t.isBlacklisted]));

    const invCountInFile = new Map<string, number>();
    for (const r of rows) {
      const inv = (r.data.invoiceNumber || '').trim().toLowerCase();
      if (inv) invCountInFile.set(inv, (invCountInFile.get(inv) || 0) + 1);
    }
    const invLineSeen = new Map<string, number>();

    for (const r of rows) {
      const d = r.data;
      const errors = checkRequired(type, d);

      if (d.invoiceDate && !validDate(d.invoiceDate) && !parseDateStr(d.invoiceDate)) {
        errors.push('InvoiceDate must be a valid date (YYYY-MM-DD)');
      }
      if (d.secondRef && d.secondRef.trim().length > 100) {
        errors.push('SecondRef cannot exceed 100 characters');
      }
      if (d.dueDate && !validDate(d.dueDate) && !parseDateStr(d.dueDate)) {
        errors.push('DueDate must be a valid date (YYYY-MM-DD)');
      }
      errors.push(...checkNumbers(d, ['quantity', 'unitPrice', 'tax', 'total'], {
        quantity: 'Qty',
        unitPrice: 'Unit Price',
        tax: 'Tax',
        total: 'Total',
      }));
      if (d.paid && isNaN(num(d.paid)!) && !['yes', 'no', 'paid', 'unpaid', 'true', 'false'].includes(d.paid.toLowerCase().trim())) {
        errors.push('Paid must be a number or status (e.g. 0, paid, unpaid)');
      }

      if (d.tenantCode) {
        const bl = tenantMap.get(d.tenantCode.trim().toLowerCase());
        if (bl === true) errors.push(`Tenant "${d.tenantCode}" is blacklisted`);
      }

      let status: PreviewRow['status'] = errors.length ? 'error' : 'valid';
      const notes: string[] = [];

      if (d.invoiceNumber) {
        const k = d.invoiceNumber.trim().toLowerCase();
        const totalLines = invCountInFile.get(k) || 1;
        const currentLine = (invLineSeen.get(k) || 0) + 1;
        invLineSeen.set(k, currentLine);

        const tCode = (d.tenantCode || '').trim().toLowerCase();
        const tName = (d.tenantName || '').trim().toLowerCase();
        const isExistingInvTenant =
          (tCode && knownInvTenant.has(`${k}|${tCode}`)) ||
          (tName && knownInvTenant.has(`${k}|${tName}`));

        if (isExistingInvTenant || knownInvoices.has(k)) {
          status = 'skip';
          notes.push(
            isExistingInvTenant
              ? `Invoice "${d.invoiceNumber.trim()}" and Tenant "${d.tenantCode || d.tenantName}" already exist - insert will be skipped`
              : `Invoice "${d.invoiceNumber.trim()}" already exists - insert will be skipped`
          );
        } else if (totalLines > 1) {
          notes.push(`Multi-line invoice (Line ${currentLine}/${totalLines})`);
        }
      }

      out.push({ rowNo: r.rowNo, data: d, status, errors: status === 'error' ? errors : notes });
    }
    return out;
  }

  if (type === 'charge') {
    const existing = await prisma.chargeType.findMany({
      where: { OR: [{ companyId }, { companyId: null }] },
      select: { code: true },
    });
    const knownCodes = new Set(existing.map((c) => c.code.trim().toLowerCase()));
    const seenCodes = new Set<string>();

    for (const r of rows) {
      const d = r.data;
      const errors = checkRequired(type, d);

      if (d.code && d.code.trim().length > 50) {
        errors.push('Charges Code cannot exceed 50 characters');
      }
      if (d.name && d.name.trim().length > 150) {
        errors.push('Charges Name cannot exceed 150 characters');
      }
      if (d.category && d.category.trim().length > 50) {
        errors.push('Charges Category cannot exceed 50 characters');
      }
      if (d.glAccountCode && d.glAccountCode.trim().length > 50) {
        errors.push('Account Code cannot exceed 50 characters');
      }
      if (d.isTaxable) {
        const val = d.isTaxable.trim().toLowerCase();
        if (!['yes', 'no', 'true', 'false', '1', '0', 'y', 'n'].includes(val)) {
          errors.push('Is_Taxable must be Yes/No, True/False, or 1/0');
        }
      }

      let status: PreviewRow['status'] = errors.length ? 'error' : 'valid';
      const notes: string[] = [];

      if (status === 'valid' && d.code) {
        const k = d.code.trim().toLowerCase();
        if (knownCodes.has(k)) {
          status = 'skip';
          notes.push(`Charges Code "${d.code.trim()}" already exists - insert will be skipped`);
        } else if (seenCodes.has(k)) {
          status = 'skip';
          notes.push(`Charges Code "${d.code.trim()}" is duplicated in file - insert will be skipped`);
        }
        seenCodes.add(k);
      }

      out.push({ rowNo: r.rowNo, data: d, status, errors: status === 'error' ? errors : notes });
    }
    return out;
  }

  // lease
  const leaseCtx = preloadedLeaseCtx ?? await loadLeaseImportContext(companyId, false);
  const {
    knownLeaseNumbers,
    knownLeaseTenant,
    propByCode,
    propByName,
    tenantMap,
    tenantByName,
    unitMap,
    chargeTypeByCode,
  } = leaseCtx;
  const unitKey = (propId: string, uNum: string) => `${propId}|${uNum.toLowerCase()}`;

  const ALLOWED_LEASE_STATUSES = ['draft', 'pending_approval', 'approved', 'active', 'expired', 'terminated', 'renewed', 'cancelled'];

  // Track multi-charge lines per lease number in the file
  const leaseCountInFile = new Map<string, number>();
  const firstRowOfLease = new Map<string, ParsedRow>();
  for (const r of rows) {
    const lNum = (r.data.leaseNumber || '').trim().toLowerCase();
    if (lNum) {
      leaseCountInFile.set(lNum, (leaseCountInFile.get(lNum) || 0) + 1);
      if (!firstRowOfLease.has(lNum)) {
        firstRowOfLease.set(lNum, r);
      }
    }
  }
  const leaseLineSeen = new Map<string, number>();

  for (const r of rows) {
    const d = r.data;
    const errors = checkRequired(type, d);

    // Target property
    let targetPropertyId = propertyId;
    const propRaw = (d.propertyCode || d.property || '').trim().toLowerCase();
    if (propRaw) {
      const matched = propByCode.get(propRaw) || propByName.get(propRaw);
      if (matched) {
        targetPropertyId = matched;
      } else {
        errors.push(`Property "${d.propertyCode || d.property}" not found`);
      }
    }

    if (d.unitNumber) {
      const u = unitMap.get(unitKey(targetPropertyId, d.unitNumber.trim()));
      if (!u) errors.push(`Unit "${d.unitNumber}" not found in property`);
    }

    if (d.tenantCode) {
      const t = tenantMap.get(d.tenantCode.trim().toLowerCase()) || tenantByName.get(d.tenantCode.trim().toLowerCase());
      if (!t) errors.push(`Tenant "${d.tenantCode}" not found`);
      else if (t.isBlacklisted) errors.push(`Tenant "${d.tenantCode}" is blacklisted`);
    }

    if (d.startDate && !validDate(d.startDate) && !parseDateStr(d.startDate)) errors.push('StartDate must be YYYY-MM-DD');
    if (d.endDate && !validDate(d.endDate) && !parseDateStr(d.endDate)) errors.push('EndDate must be YYYY-MM-DD');
    if (d.handoverDate && !validDate(d.handoverDate) && !parseDateStr(d.handoverDate)) errors.push('HandoverDate must be YYYY-MM-DD');
    if (d.contractStartDate && !validDate(d.contractStartDate) && !parseDateStr(d.contractStartDate)) errors.push('ContractStartDate must be YYYY-MM-DD');
    if (d.contractEndDate && !validDate(d.contractEndDate) && !parseDateStr(d.contractEndDate)) errors.push('ContractEndDate must be YYYY-MM-DD');

    const sDate = parseDateStr(d.startDate);
    const eDate = parseDateStr(d.endDate);
    if (sDate && eDate && eDate <= sDate) {
      errors.push('EndDate must be after StartDate');
    }

    if (d.status) {
      const st = norm(d.status);
      if (!ALLOWED_LEASE_STATUSES.includes(st)) {
        errors.push(`Status must be one of: ${ALLOWED_LEASE_STATUSES.join(', ')}`);
      }
    }

    errors.push(...checkNumbers(d, ['rentAmount', 'leaseTermMonths', 'chargesAmount'], {
      rentAmount: 'RentAmount', leaseTermMonths: 'LeaseTerm', chargesAmount: 'Charges Amount',
    }));

    // Charges validation:
    const chgCode = (d.chargesCode || d.chargeCode || '').trim();
    const rawChgAmount = (d.chargesAmount || d.chargeAmount || '').trim();

    if (chgCode) {
      if (chgCode.toUpperCase() === 'RENT') {
        errors.push('Rent is not a charge — please enter base rent in RentAmount column instead');
      } else if (!chargeTypeByCode.has(chgCode.toLowerCase())) {
        errors.push(`Charges Code "${chgCode}" does not exist in Charges Setup`);
      }
      if (!rawChgAmount) {
        errors.push('Charges Amount is required when Charges Code is provided');
      } else if (Number.isNaN(num(rawChgAmount))) {
        errors.push('Charges Amount must be a number');
      }
    } else if (rawChgAmount) {
      errors.push('Charges Code is required when Charges Amount is provided');
    }

    // Check consistency across multi-charge lines for the same lease
    const lNum = (d.leaseNumber || '').trim().toLowerCase();
    if (lNum && (leaseCountInFile.get(lNum) || 0) > 1) {
      const firstRow = firstRowOfLease.get(lNum);
      if (firstRow && firstRow.rowNo !== r.rowNo) {
        const fd = firstRow.data;
        const diffs: string[] = [];
        if ((fd.propertyCode || fd.property || '').trim().toLowerCase() !== (d.propertyCode || d.property || '').trim().toLowerCase()) diffs.push('Property');
        if ((fd.unitNumber || '').trim().toLowerCase() !== (d.unitNumber || '').trim().toLowerCase()) diffs.push('Unit');
        if ((fd.tenantCode || '').trim().toLowerCase() !== (d.tenantCode || '').trim().toLowerCase()) diffs.push('TenantCode');
        if ((fd.startDate || '').trim() !== (d.startDate || '').trim()) diffs.push('StartDate');
        if ((fd.endDate || '').trim() !== (d.endDate || '').trim()) diffs.push('EndDate');
        if ((fd.rentAmount || '').trim() !== (d.rentAmount || '').trim()) diffs.push('RentAmount');
        if ((fd.status || '').trim().toLowerCase() !== (d.status || '').trim().toLowerCase()) diffs.push('Status');
        if (diffs.length > 0) {
          errors.push(`Multi-charge lines for Lease "${d.leaseNumber}" have conflicting ${diffs.join(', ')} (must match across all lines)`);
        }
      }
    }

    let status: PreviewRow['status'] = errors.length ? 'error' : 'valid';
    const notes: string[] = [];

    if (d.leaseNumber) {
      const tCode = (d.tenantCode || '').trim().toLowerCase();
      const isExistingLeaseTenant =
        (tCode && knownLeaseTenant.has(`${lNum}|${tCode}`)) ||
        (d.tenantName && knownLeaseTenant.has(`${lNum}|${d.tenantName.trim().toLowerCase()}`));
      const isExistingLeaseNum = knownLeaseNumbers.has(lNum);

      if (isExistingLeaseTenant || isExistingLeaseNum) {
        status = 'skip';
        notes.push(
          isExistingLeaseTenant
            ? `Lease Number "${d.leaseNumber.trim()}" and Tenant "${d.tenantCode || d.tenantName || ''}" already exist - insert will be skipped`
            : `Lease Number "${d.leaseNumber.trim()}" already exists - insert will be skipped`
        );
      } else {
        const totalLines = leaseCountInFile.get(lNum) || 1;
        const currentLine = (leaseLineSeen.get(lNum) || 0) + 1;
        leaseLineSeen.set(lNum, currentLine);
        if (totalLines > 1) {
          notes.push(`Multi-charge lease (Line ${currentLine}/${totalLines})`);
        }
      }
    }

    out.push({ rowNo: r.rowNo, data: d, status, errors: status === 'error' ? errors : notes });
  }
  return out;
}

const optNum = (s?: string | null) => (!s || s === '' ? undefined : (num(s) as number));

export const generalImportService = {
  assertType,

  async buildSample(type: string): Promise<{ buffer: Buffer; filename: string }> {
    const normType = (type === 'charges' ? 'charge' : type) as ImportType;
    assertType(normType);
    const cols = COLUMNS[normType];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(normType === 'charge' ? 'Charges Import' : `${normType[0].toUpperCase()}${normType.slice(1)} Import`);
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 4) }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell, idx) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cols[idx - 1].required ? 'FF1D4ED8' : 'FF64748B' } };
    });
    const sampleCount = Math.max(...cols.map((c) => c.samples.length));
    for (let i = 0; i < sampleCount; i++) {
      ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.samples[i] !== undefined ? c.samples[i] : ''])));
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, filename: `${normType === 'charge' ? 'charges' : normType}-import-sample.xlsx` };
  },

  async preview(type: string, propertyId: string, companyId: string, buffer: Buffer) {
    const normType = (type === 'charges' ? 'charge' : type) as ImportType;
    assertType(normType);
    const rows = await validateRows(normType, propertyId, companyId, await parseWorkbook(normType, buffer));
    const validCount = rows.filter((r) => r.status === 'valid').length;
    const skipCount = rows.filter((r) => r.status === 'skip').length;
    return {
      type: normType,
      columns: COLUMNS[normType].map((c) => ({ key: c.key, header: c.header })),
      rows: rows.slice(0, 500),
      total: rows.length,
      validCount,
      skipCount,
      errorCount: rows.length - validCount - skipCount,
    };
  },

  async import(type: string, propertyId: string, companyId: string, userId: string, buffer: Buffer) {
    const normType = (type === 'charges' ? 'charge' : type) as ImportType;
    assertType(normType);
    const parsedRows = await parseWorkbook(normType, buffer);
    const preloadedLeaseCtx = normType === 'lease' ? await loadLeaseImportContext(companyId, true) : undefined;
    const rows = await validateRows(normType, propertyId, companyId, parsedRows, preloadedLeaseCtx);
    const failed: { rowNo: number; errors: string[] }[] = rows
      .filter((r) => r.status === 'error')
      .map((r) => ({ rowNo: r.rowNo, errors: r.errors }));
    // 'skip' rows (meter already exists) still flow through so their unit link can be made.
    const valid = rows.filter((r) => r.status !== 'error');
    let imported = 0;
    let skipped = 0;
    let linked = 0;
    let linkSkipped = 0;
    let skippedLeases = 0;
    let unitChargesCount = 0;
    let billingSchedulesCount = 0;
    let unitStatusUpdated = 0;
    const notes: { rowNo: number; message: string }[] = [];

    if (normType === 'meter') {
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
    } else if (normType === 'unit') {
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
    } else if (normType === 'tenant') {
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
    } else if (normType === 'lead') {
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
    } else if (normType === 'invoice') {
      const fileInvNumbers = Array.from(
        new Set(valid.map((r) => (r.data.invoiceNumber || '').trim()).filter(Boolean))
      );
      const fileUnitCandidates = Array.from(
        new Set(
          valid
            .map((r) => (r.data.unitNumber || r.data.unit || r.data.unitPeriod || '').trim().split(/[\(\s]/)[0].trim())
            .filter(Boolean)
        )
      );

      const [existingInvoices, properties, tenants, chargeTypes, matchedUnits, openPeriods, glAccounts, initialJournalCount] = await Promise.all([
        findInvoicesByNumbers(companyId, fileInvNumbers),
        prisma.property.findMany({ where: { companyId }, select: { id: true, code: true, name: true } }),
        prisma.tenant.findMany({
          where: { companyId, deletedAt: null },
          select: { id: true, code: true, firstName: true, lastName: true, companyName: true },
        }),
        prisma.chargeType.findMany({
          where: { OR: [{ companyId }, { companyId: null }] },
          select: { id: true, code: true, name: true },
        }),
        findUnitsByNumbers(fileUnitCandidates),
        prisma.fiscalPeriod.findMany({
          where: { companyId, status: 'open' },
          select: { id: true, startDate: true, endDate: true },
        }),
        prisma.glAccount.findMany({
          where: { companyId, code: { in: ['1100', '4100', '2200'] }, isActive: true },
          select: { id: true, code: true },
        }),
        prisma.journalEntry.count({ where: { companyId } }),
      ]);

      const matchedUnitIds = matchedUnits.map((u) => u.id);
      const matchedLeases = await findActiveLeasesByUnitIds(companyId, matchedUnitIds);

      const glAccByCode = new Map(glAccounts.map((a) => [a.code, a.id]));
      const arAccId = glAccByCode.get('1100');
      const revAccId = glAccByCode.get('4100');
      const taxAccId = glAccByCode.get('2200');
      let nextJournalSeq = initialJournalCount;

      const unitByPropAndNum = new Map<string, string>();
      for (const u of matchedUnits) {
        unitByPropAndNum.set(`${u.propertyId}|${u.unitNumber.trim().toLowerCase()}`, u.id);
      }

      const leaseByTenantAndUnit = new Map<string, string>();
      for (const l of matchedLeases) {
        if (!leaseByTenantAndUnit.has(`${l.tenantId}|${l.unitId}`)) {
          leaseByTenantAndUnit.set(`${l.tenantId}|${l.unitId}`, l.id);
        }
      }

      const knownInvoices = new Set<string>();
      const knownInvTenant = new Set<string>();
      for (const inv of existingInvoices) {
        const numStr = inv.invoiceNumber.trim().toLowerCase();
        knownInvoices.add(numStr);
        if (inv.tenantId) knownInvTenant.add(`${numStr}|${inv.tenantId.toLowerCase()}`);
        if (inv.tenant?.code) knownInvTenant.add(`${numStr}|${inv.tenant.code.trim().toLowerCase()}`);
        if (inv.tenant?.companyName) knownInvTenant.add(`${numStr}|${inv.tenant.companyName.trim().toLowerCase()}`);
        const fullName = `${inv.tenant?.firstName || ''} ${inv.tenant?.lastName || ''}`.trim().toLowerCase();
        if (fullName) knownInvTenant.add(`${numStr}|${fullName}`);
        if (inv.tenant?.firstName) knownInvTenant.add(`${numStr}|${inv.tenant.firstName.trim().toLowerCase()}`);
      }
      const propByCode = new Map(properties.filter((p) => p.code).map((p) => [p.code!.toLowerCase(), p.id]));
      const propByName = new Map(properties.map((p) => [p.name.toLowerCase(), p.id]));

      const tenantMap = new Map<string, typeof tenants[0]>();
      tenants.forEach((t) => {
        if (t.code) tenantMap.set(t.code.trim().toLowerCase(), t);
        if (t.companyName) tenantMap.set(t.companyName.trim().toLowerCase(), t);
        const fullName = `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase();
        if (fullName) tenantMap.set(fullName, t);
        if (t.firstName) tenantMap.set(t.firstName.trim().toLowerCase(), t);
      });

      const chargeTypeMap = new Map<string, string>();
      chargeTypes.forEach((ct) => {
        chargeTypeMap.set(ct.code.trim().toLowerCase(), ct.id);
        chargeTypeMap.set(ct.name.trim().toLowerCase(), ct.id);
      });

      // Group rows by invoice number
      const groups = new Map<string, typeof valid>();
      for (const r of valid) {
        const invNum = r.data.invoiceNumber.trim();
        const k = invNum.toLowerCase();
        if (!groups.has(k)) {
          groups.set(k, []);
        }
        groups.get(k)!.push(r);
      }

      interface PreparedInvoice {
        groupRows: typeof valid;
        invoiceData: {
          id: string;
          companyId: string;
          propertyId: string;
          unitId: string | null;
          leaseId: string | null;
          tenantId: string;
          invoiceNumber: string;
          secondRef: string | null;
          invoiceType: string;
          status: string;
          invoiceDate: Date;
          dueDate: Date;
          periodFrom: Date | null;
          periodTo: Date | null;
          subtotal: number;
          taxAmount: number;
          totalAmount: number;
          paidAmount: number;
          currency: string;
          notes: string | null;
          createdBy: string;
        };
        lineItems: {
          id: string;
          invoiceId: string;
          chargeTypeId: string;
          description: string;
          quantity: number;
          unitPrice: number;
          discountPct: number;
          amount: number;
          taxRate: number;
          taxAmount: number;
          lineTotal: number;
          periodFrom: Date | null;
          periodTo: Date | null;
          sortOrder: number;
        }[];
      }

      const INVOICE_BATCH_SIZE = 500;
      let pendingBatch: PreparedInvoice[] = [];

      const flushInvoiceBatch = async (batch: PreparedInvoice[]) => {
        if (batch.length === 0) return;
        let insertedBatch: PreparedInvoice[] = [];
        try {
          await prisma.$transaction([
            prisma.invoice.createMany({ data: batch.map((b) => b.invoiceData) }),
            prisma.invoiceLine.createMany({ data: batch.flatMap((b) => b.lineItems) }),
          ]);
          imported += batch.length;
          insertedBatch = batch;
        } catch {
          for (const item of batch) {
            try {
              const { id, ...restInv } = item.invoiceData;
              const created = await prisma.invoice.create({
                data: {
                  id,
                  ...restInv,
                  lines: {
                    create: item.lineItems.map(({ id: _lid, invoiceId: _iid, ...ln }) => ln),
                  },
                },
              });
              item.invoiceData.id = created.id;
              imported++;
              insertedBatch.push(item);
            } catch (e) {
              item.groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: [(e as Error).message] }));
            }
          }
        }

        if (insertedBatch.length > 0 && openPeriods.length > 0 && arAccId && revAccId) {
          try {
            const jeRows: any[] = [];
            const jelRows: any[] = [];
            for (const item of insertedBatch) {
              const inv = item.invoiceData;
              const period = openPeriods.find((p) => p.startDate <= inv.invoiceDate && p.endDate >= inv.invoiceDate);
              if (!period) continue;
              if (inv.taxAmount > 0 && !taxAccId) continue;
              const totalDebit = inv.totalAmount;
              const totalCredit = inv.subtotal + (inv.taxAmount > 0 ? inv.taxAmount : 0);
              if (Math.abs(totalDebit - totalCredit) > 0.01) continue;

              nextJournalSeq++;
              const jeId = randomUUID();
              const journalNumber = `JE-${inv.invoiceDate.getFullYear()}-${String(nextJournalSeq).padStart(5, '0')}`;
              jeRows.push({
                id: jeId,
                companyId,
                journalNumber,
                entryDate: inv.invoiceDate,
                fiscalPeriodId: period.id,
                entryType: 'ar_invoice',
                description: `AR Invoice ${inv.invoiceNumber}`,
                status: 'posted',
                referenceType: 'invoice',
                referenceId: inv.id,
                totalDebit,
                totalCredit,
                postedAt: new Date(),
                createdBy: '00000000-0000-0000-0000-000000000000',
              });
              jelRows.push(
                {
                  id: randomUUID(),
                  journalEntryId: jeId,
                  accountId: arAccId,
                  description: `AR — ${inv.invoiceNumber}`,
                  debit: inv.totalAmount,
                  credit: 0,
                  propertyId: inv.propertyId || null,
                  sortOrder: 0,
                },
                {
                  id: randomUUID(),
                  journalEntryId: jeId,
                  accountId: revAccId,
                  description: `Revenue — ${inv.invoiceNumber}`,
                  debit: 0,
                  credit: inv.subtotal,
                  propertyId: inv.propertyId || null,
                  sortOrder: 1,
                },
              );
              if (inv.taxAmount > 0 && taxAccId) {
                jelRows.push({
                  id: randomUUID(),
                  journalEntryId: jeId,
                  accountId: taxAccId,
                  description: `Tax Payable — ${inv.invoiceNumber}`,
                  debit: 0,
                  credit: inv.taxAmount,
                  propertyId: inv.propertyId || null,
                  sortOrder: 2,
                });
              }
            }
            if (jeRows.length > 0) {
              await prisma.$transaction([
                prisma.journalEntry.createMany({ data: jeRows, skipDuplicates: true }),
                prisma.journalEntryLine.createMany({ data: jelRows }),
              ]);
            }
          } catch {
            // Non-critical GL auto-post failure
          }
        }
      };

      for (const [invKey, groupRows] of groups.entries()) {
        const headerRow = groupRows[0];
        const d = headerRow.data;
        const invNum = d.invoiceNumber.trim();
        const secondRef = groupRows.find((r) => r.data.secondRef?.trim())?.data.secondRef?.trim() || null;
        const tCode = (d.tenantCode || '').trim().toLowerCase();
        const tName = (d.tenantName || '').trim().toLowerCase();
        const isExistingInvTenant =
          (tCode && knownInvTenant.has(`${invKey}|${tCode}`)) ||
          (tName && knownInvTenant.has(`${invKey}|${tName}`));

        if (isExistingInvTenant || knownInvoices.has(invKey)) {
          skipped++;
          const skipMsg = isExistingInvTenant
            ? `Invoice "${invNum}" and Tenant "${d.tenantCode || d.tenantName || ''}" already exist - skipped`
            : `Invoice "${invNum}" already exists - skipped`;
          notes.push({ rowNo: headerRow.rowNo, message: skipMsg });
          continue;
        }

        try {
          // Resolve Property
          let targetPropertyId = propertyId;
          const propRaw = (d.propertyCode || d.property || d.propertyFloor || '').trim().toLowerCase();
          if (propRaw) {
            const rawProp = propRaw.split(/[\/\-,]/)[0].trim().toLowerCase();
            const matched = propByCode.get(rawProp) || propByName.get(rawProp);
            if (matched) targetPropertyId = matched;
          }

          // Resolve Tenant
          let targetTenantId: string | null = null;
          if (d.tenantCode) {
            const t = tenantMap.get(d.tenantCode.trim().toLowerCase());
            if (t) targetTenantId = t.id;
          }
          if (!targetTenantId && d.tenantName) {
            const t = tenantMap.get(d.tenantName.trim().toLowerCase());
            if (t) targetTenantId = t.id;
          }
          if (!targetTenantId) {
            const createdTenant = await prisma.tenant.create({
              data: {
                companyId,
                code: d.tenantCode?.trim() || null,
                firstName: d.tenantName?.trim() || d.tenantCode?.trim() || 'Imported Tenant',
                tenantType: 'individual',
              },
            });
            targetTenantId = createdTenant.id;
            if (createdTenant.code) tenantMap.set(createdTenant.code.toLowerCase(), createdTenant as any);
            if (createdTenant.firstName) tenantMap.set(createdTenant.firstName.toLowerCase(), createdTenant as any);
          }

          // Resolve Unit and Lease
          let resolvedUnitId: string | null = null;
          let resolvedLeaseId: string | null = null;
          let periodFrom: Date | null = null;
          let periodTo: Date | null = null;

          const unitRaw = (d.unitNumber || d.unit || d.unitPeriod || '').trim();
          if (unitRaw) {
            const unitCandidate = unitRaw.split(/[\(\s]/)[0].trim().toLowerCase();
            if (unitCandidate) {
              const uid = unitByPropAndNum.get(`${targetPropertyId}|${unitCandidate}`);
              if (uid) {
                resolvedUnitId = uid;
                const lid = leaseByTenantAndUnit.get(`${targetTenantId}|${uid}`);
                if (lid) resolvedLeaseId = lid;
              }
            }
          }

          const periodRaw = (d.period || d.unitPeriod || '').trim();
          if (periodRaw) {
            const dateMatches = periodRaw.match(/\d{4}[-\/]\d{2}[-\/]\d{2}/g);
            if (dateMatches && dateMatches.length >= 2) {
              periodFrom = parseDateStr(dateMatches[0]);
              periodTo = parseDateStr(dateMatches[1]);
            } else if (dateMatches && dateMatches.length === 1) {
              periodFrom = parseDateStr(dateMatches[0]);
            } else {
              const ym = periodRaw.match(/^(\d{4})[-\/](\d{1,2})$/);
              if (ym) {
                const y = parseInt(ym[1], 10);
                const m = parseInt(ym[2], 10);
                periodFrom = new Date(Date.UTC(y, m - 1, 1));
                periodTo = new Date(Date.UTC(y, m, 0));
              }
            }
          }

          const invDate = parseDateStr(d.invoiceDate) || new Date();
          const dueDate = parseDateStr(d.dueDate) || new Date(invDate.getTime() + 14 * 86400000);

          const currency = (d.currency?.trim() || 'USD').toUpperCase();
          const rawStatus = norm(d.status || d.paidStatus || 'issued');
          const rawPaid = (d.paid ?? '').toString().trim().toLowerCase();
          const isPaidText = ['paid', 'yes', 'true'].includes(rawPaid);
          const paidNum = num(d.paid);

          const invoiceId = randomUUID();
          let subtotal = 0;
          let invoiceTax = 0;
          let invoiceTotal = 0;
          const lineItems: PreparedInvoice['lineItems'] = [];

          for (let idx = 0; idx < groupRows.length; idx++) {
            const lineRow = groupRows[idx];
            const ld = lineRow.data;
            const ctRaw = ld.chargeType?.trim() || 'RENT';
            const ctKey = ctRaw.toLowerCase();

            let ctId = chargeTypeMap.get(ctKey);
            if (!ctId) {
              const newCt = await prisma.chargeType.create({
                data: {
                  companyId,
                  code: ctRaw.toUpperCase().replace(/\s+/g, '_').slice(0, 30),
                  name: ctRaw,
                  category: 'other',
                  isActive: true,
                },
              });
              ctId = newCt.id;
              chargeTypeMap.set(ctKey, ctId);
              chargeTypeMap.set(newCt.code.toLowerCase(), ctId);
            }

            const qty = num(ld.quantity) || 1;
            const unitPrice = num(ld.unitPrice) || 0;
            const tax = num(ld.tax) || 0;
            const total = num(ld.total);

            let amount = Math.round(qty * unitPrice * 100) / 100;
            if (amount === 0 && total !== null && total > 0) {
              amount = Math.max(0, total - tax);
            }
            const lineTotal = total !== null ? total : amount + tax;
            const taxRate = amount > 0 && tax > 0 ? Math.round((tax / amount) * 10000) / 10000 : 0;

            subtotal += amount;
            invoiceTax += tax;
            invoiceTotal += lineTotal;

            lineItems.push({
              id: randomUUID(),
              invoiceId,
              chargeTypeId: ctId,
              description: (ld.description || ld.chargeType || 'Charge item').slice(0, 500),
              quantity: qty,
              unitPrice: unitPrice || (qty > 0 ? amount / qty : 0),
              discountPct: 0,
              amount,
              taxRate,
              taxAmount: tax,
              lineTotal,
              periodFrom,
              periodTo,
              sortOrder: idx,
            });
          }

          const finalStatus = ['paid'].includes(rawStatus) || isPaidText || (paidNum !== null && paidNum > 0 && paidNum >= invoiceTotal)
            ? 'paid'
            : ['draft'].includes(rawStatus)
            ? 'draft'
            : ['partially_paid', 'partial'].includes(rawStatus) || (paidNum !== null && paidNum > 0 && paidNum < invoiceTotal)
            ? 'partially_paid'
            : ['overdue'].includes(rawStatus)
            ? 'overdue'
            : ['void'].includes(rawStatus)
            ? 'void'
            : 'issued';

          let paidAmount = 0;
          if (paidNum !== null && !isNaN(paidNum)) {
            paidAmount = Math.min(invoiceTotal, Math.max(0, paidNum));
          } else if (finalStatus === 'paid' || isPaidText) {
            paidAmount = invoiceTotal;
          }

          knownInvoices.add(invKey);
          if (targetTenantId) knownInvTenant.add(`${invKey}|${targetTenantId.toLowerCase()}`);
          if (d.tenantCode) knownInvTenant.add(`${invKey}|${d.tenantCode.trim().toLowerCase()}`);
          if (d.tenantName) knownInvTenant.add(`${invKey}|${d.tenantName.trim().toLowerCase()}`);

          pendingBatch.push({
            groupRows,
            invoiceData: {
              id: invoiceId,
              companyId,
              propertyId: targetPropertyId,
              unitId: resolvedUnitId,
              leaseId: resolvedLeaseId,
              tenantId: targetTenantId,
              invoiceNumber: invNum,
              secondRef,
              invoiceType: 'invoice',
              status: finalStatus,
              invoiceDate: invDate,
              dueDate,
              periodFrom,
              periodTo,
              subtotal,
              taxAmount: invoiceTax,
              totalAmount: invoiceTotal,
              paidAmount,
              currency,
              notes: d.description || null,
              createdBy: userId,
            },
            lineItems,
          });

          if (pendingBatch.length >= INVOICE_BATCH_SIZE) {
            await flushInvoiceBatch(pendingBatch);
            pendingBatch = [];
          }
        } catch (e) {
          groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: [(e as Error).message] }));
        }
      }

      if (pendingBatch.length > 0) {
        await flushInvoiceBatch(pendingBatch);
      }
    } else if (normType === 'lease') {
      const leaseCtx = preloadedLeaseCtx ?? await loadLeaseImportContext(companyId, true);
      const {
        chargeTypes,
        floorSetups,
        knownLeaseNumbers,
        knownLeaseTenant,
        propByCode,
        propByName,
        tenantMap,
        tenantByName,
        unitMap,
        chargeTypeByCode,
      } = leaseCtx;
      const unitKey = (propId: string, uNum: string) => `${propId}|${uNum.toLowerCase()}`;

      const floorLabelMap = new Map<string, string>();
      for (const fs of floorSetups) {
        floorLabelMap.set(`${fs.propertyId}|${fs.floorNumber}`, fs.floorLabel);
      }

      const isRentChargeType = (ct: { code: string; name: string; category: string }) => {
        const codeUp = (ct.code || '').trim().toUpperCase();
        const catLow = (ct.category || '').trim().toLowerCase();
        const nameLow = (ct.name || '').trim().toLowerCase();
        return (
          codeUp === 'RENT' ||
          catLow === 'rent' ||
          /^U\d{4}/i.test(codeUp) ||
          nameLow === 'base rent' ||
          nameLow.includes('unit fee')
        );
      };

      const isRentInvoiceLine = (line: LeaseCandidateInvoiceLine) => {
        const ct = line.chargeType;
        if (ct && isRentChargeType(ct)) return true;
        const desc = (line.description || '').toLowerCase();
        return desc.includes('base rent') || desc.includes('monthly rent') || desc.includes('unit fee') || /\brent\b/i.test(desc);
      };

      const doesLineMatchCharge = (
        line: LeaseCandidateInvoiceLine,
        ct: { id: string; code: string; name: string; category: string },
      ) => {
        if (line.chargeTypeId === ct.id) return true;
        const lineCode = (line.chargeType?.code || '').trim().toUpperCase();
        const ctCode = (ct.code || '').trim().toUpperCase();
        if (lineCode && ctCode && lineCode === ctCode) return true;

        const lineCat = (line.chargeType?.category || '').trim().toLowerCase();
        const ctCat = (ct.category || '').trim().toLowerCase();
        const lineName = (line.chargeType?.name || '').trim().toLowerCase();
        const ctName = (ct.name || '').trim().toLowerCase();
        const desc = (line.description || '').trim().toLowerCase();

        const isCtMaint = ctCat === 'maintenance' || /^M\d{4}/i.test(ctCode) || ctName.includes('maintenance') || ctName.includes('maintainance');
        const isLineMaint = lineCode === 'MAINTENANCE' || lineCode === 'MAINTAINANCE' || lineCat === 'maintenance' || /^M\d{4}/i.test(lineCode) || lineName.includes('maintenance') || lineName.includes('maintainance') || desc.includes('maintenance') || desc.startsWith('main/');
        if (isCtMaint && isLineMaint) return true;

        const isCtWater = ctCode === 'WATER' || ctName.includes('water');
        const isLineWater = lineCode === 'WATER' || lineName.includes('water') || desc.includes('water') || desc.startsWith('water/');
        if (isCtWater && isLineWater) return true;

        const isCtMepe = !isCtWater && (ctCode === 'MEPE' || ctCode === 'ELECTRICITY' || /^FIX\d{4}/i.test(ctCode) || ctName.includes('electricity') || ctName.includes('mepe') || ctName.includes('fixed'));
        const isLineMepe = !isLineWater && (lineCode === 'MEPE' || lineCode === 'ELECTRICITY' || /^FIX\d{4}/i.test(lineCode) || lineName.includes('electricity') || lineName.includes('mepe') || desc.includes('electricity') || desc.includes('mepe') || desc.startsWith('mepe/'));
        if (isCtMepe && isLineMepe) return true;

        const isCtDeposit = ctCat === 'deposit' || /^D\d{4}/i.test(ctCode) || ctName.includes('deposit');
        const isLineDeposit = lineCat === 'deposit' || /^D\d{4}/i.test(lineCode) || lineName.includes('deposit') || desc.includes('deposit');
        if (isCtDeposit && isLineDeposit) return true;

        if (ctName && (lineName === ctName || desc.startsWith(ctName))) return true;
        return false;
      };

      const computeNextUnbilledMonth = (
        baseStartDate: Date,
        latestPeriodFrom: Date | null,
        latestPeriodTo: Date | null,
        latestInvoiceDate: Date | null,
      ): Date => {
        let candidate = baseStartDate;
        if (latestPeriodFrom) {
          const d1 = billingSchedulesService.computeNextBillingDateFromStart(latestPeriodFrom, 'monthly', 1);
          if (d1 > candidate) candidate = d1;
        }
        if (latestPeriodTo) {
          const d2 = latestPeriodTo.getUTCDate() === 1
            ? new Date(Date.UTC(latestPeriodTo.getUTCFullYear(), latestPeriodTo.getUTCMonth(), 1))
            : billingSchedulesService.computeNextBillingDateFromStart(latestPeriodTo, 'monthly', 1);
          if (d2 > candidate) candidate = d2;
        }
        if (!latestPeriodFrom && !latestPeriodTo && latestInvoiceDate) {
          const d3 = billingSchedulesService.computeNextBillingDateFromStart(latestInvoiceDate, 'monthly', 1);
          if (d3 > candidate) candidate = d3;
        }
        return candidate < baseStartDate ? baseStartDate : candidate;
      };

      let rentChargeType = chargeTypes.find((c) => c.code.trim().toUpperCase() === 'RENT' || c.category === 'rent');
      if (!rentChargeType) {
        rentChargeType = await prisma.chargeType.findFirst({
          where: { code: 'RENT', OR: [{ companyId: null }, { companyId }] },
          select: { id: true, code: true, name: true, category: true },
        }) ?? undefined;
      }

      // Group valid rows by leaseNumber (or fallback to rowNo if missing)
      const groups = new Map<string, typeof valid>();
      for (const r of valid) {
        const leaseNum = (r.data.leaseNumber || '').trim();
        const lNum = leaseNum.toLowerCase();
        const groupKey = lNum || `row_${r.rowNo}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(r);
      }

      // Collect target unitIds, unit+tenant pairs, and leaseNumbers for non-skipped groups so we only query relevant invoices & unitCharges
      const targetUnitIdSet = new Set<string>();
      const targetLeaseNumSet = new Set<string>();
      const targetUnitTenantPairSet = new Set<string>();
      const chargeTypeById = new Map(chargeTypes.map((ct) => [ct.id, ct]));
      for (const [_groupKey, groupRows] of groups.entries()) {
        const d = groupRows[0].data;
        const leaseNum = (d.leaseNumber || '').trim();
        const lNum = leaseNum.toLowerCase();
        const tCode = (d.tenantCode || '').trim().toLowerCase();
        const tName = (d.tenantName || '').trim().toLowerCase();
        const isExisting =
          (tCode && knownLeaseTenant.has(`${lNum}|${tCode}`)) ||
          (tName && knownLeaseTenant.has(`${lNum}|${tName}`)) ||
          Boolean(lNum && knownLeaseNumbers.has(lNum));
        if (isExisting) continue;

        let targetPropertyId = propertyId;
        const propRaw = (d.propertyCode || d.property || '').trim().toLowerCase();
        if (propRaw) {
          const matched = propByCode.get(propRaw) || propByName.get(propRaw);
          if (matched) targetPropertyId = matched;
        }
        const u = unitMap.get(unitKey(targetPropertyId, (d.unitNumber || '').trim()));
        const targetTenant = tenantMap.get(tCode) || (tName ? tenantByName.get(tName) : undefined);
        if (u) {
          targetUnitIdSet.add(u.id);
          if (targetTenant) {
            targetUnitTenantPairSet.add(`${u.id}|${targetTenant.id}`);
          }
        }
        if (leaseNum) targetLeaseNumSet.add(leaseNum);
      }

      const [existingCompanyInvoices, existingUnitCharges] = await Promise.all([
        findCandidateInvoicesForLeaseImport(
          companyId,
          Array.from(targetUnitIdSet),
          Array.from(targetLeaseNumSet),
          targetUnitTenantPairSet,
          chargeTypeById,
        ),
        findUnitChargesByUnitIds(Array.from(targetUnitIdSet)),
      ]);

      const invoicesByUnitTenant = new Map<string, LeaseCandidateInvoice[]>();
      const invoicesBySecondRef = new Map<string, LeaseCandidateInvoice[]>();
      for (const inv of existingCompanyInvoices) {
        if (inv.unitId && inv.tenantId) {
          const utKey = `${inv.unitId}|${inv.tenantId}`;
          let arr = invoicesByUnitTenant.get(utKey);
          if (!arr) {
            arr = [];
            invoicesByUnitTenant.set(utKey, arr);
          }
          arr.push(inv);
        }
        if (inv.secondRef) {
          const srKey = inv.secondRef.trim().toLowerCase();
          if (srKey) {
            let arr = invoicesBySecondRef.get(srKey);
            if (!arr) {
              arr = [];
              invoicesBySecondRef.set(srKey, arr);
            }
            arr.push(inv);
          }
        }
      }

      type UnitChargeState = {
        id: string;
        unitId: string;
        chargeTypeId: string;
        amount: number;
        persistedInDb: boolean;
      };
      const unitChargeStateMap = new Map<string, UnitChargeState>();
      for (const uc of existingUnitCharges) {
        unitChargeStateMap.set(`${uc.unitId}|${uc.chargeTypeId}`, {
          id: uc.id,
          unitId: uc.unitId,
          chargeTypeId: uc.chargeTypeId,
          amount: Number(uc.amount ?? 0),
          persistedInDb: true,
        });
      }

      interface PreparedLease {
        groupRows: typeof valid;
        leaseData: {
          id: string;
          companyId: string;
          propertyId: string;
          unitId: string;
          tenantId: string;
          leaseNumber: string;
          status: string;
          startDate: Date;
          endDate: Date;
          handoverDate: Date | null;
          leaseTermMonths: number;
          rentAmount: number;
          currency: string;
          rentalAgreement?: { contractStartDate: string | null; contractEndDate: string | null };
          createdBy: string;
        };
        unitStatusChange?: {
          unitId: string;
          propertyId: string;
          fromStatus: string | null;
          toStatus: string;
          reason: string;
        };
        unlinkedInvoiceIds: string[];
        unitChargeOps: {
          id: string;
          unitId: string;
          chargeTypeId: string;
          amount: number;
          isNew: boolean;
        }[];
        unitChargeHistories: {
          id: string;
          unitId: string;
          action: string;
          chargeTypeId: string;
          amount: number;
          oldChargeTypeId: string | null;
          oldAmount: number | null;
          changedBy: string;
        }[];
        schedulesToCreate: {
          id: string;
          companyId: string;
          propertyId: string;
          unitId: string;
          tenantId: string;
          leaseId: string;
          chargeTypeId: string;
          description: string;
          amount: number;
          quantity: number;
          currency: string;
          billingCycle: string;
          billingDay: number;
          paymentDueDays: number;
          startDate: Date;
          endDate: Date;
          nextBillingDate: Date;
          status: string;
          createdBy: string;
        }[];
        pendingNotes: { rowNo: number; message: string }[];
      }

      const touchedPropertyIds = new Set<string>();
      const LEASE_BATCH_SIZE = 250;
      let pendingLeaseBatch: PreparedLease[] = [];

      const applySideEffectsForInsertedLeases = async (insertedBatch: PreparedLease[]) => {
        if (insertedBatch.length === 0) return;

        // 1. Append notes and counters for successfully inserted leases
        for (const item of insertedBatch) {
          notes.push(...item.pendingNotes);
          unitChargesCount += item.unitChargeOps.length;
          billingSchedulesCount += item.schedulesToCreate.length;
          if (item.unitStatusChange) {
            unitStatusUpdated++;
            touchedPropertyIds.add(item.unitStatusChange.propertyId);
          }
        }

        // 2. Batch unit status updates & status history
        const latestUnitStatusByUnitId = new Map<string, string>();
        const statusHistoryRows: {
          id: string;
          unitId: string;
          fromStatus: string | null;
          toStatus: string;
          reason: string;
          changedBy: string;
        }[] = [];

        for (const item of insertedBatch) {
          if (item.unitStatusChange) {
            latestUnitStatusByUnitId.set(item.unitStatusChange.unitId, item.unitStatusChange.toStatus);
            statusHistoryRows.push({
              id: randomUUID(),
              unitId: item.unitStatusChange.unitId,
              fromStatus: item.unitStatusChange.fromStatus,
              toStatus: item.unitStatusChange.toStatus,
              reason: item.unitStatusChange.reason,
              changedBy: userId,
            });
          }
        }

        const occupiedUnitIds: string[] = [];
        const reservedUnitIds: string[] = [];
        for (const [uId, st] of latestUnitStatusByUnitId.entries()) {
          if (st === 'occupied') occupiedUnitIds.push(uId);
          else if (st === 'reserved') reservedUnitIds.push(uId);
        }

        if (occupiedUnitIds.length > 0) {
          await prisma.unit.updateMany({
            where: { id: { in: occupiedUnitIds } },
            data: { status: 'occupied' },
          }).catch(() => {});
        }
        if (reservedUnitIds.length > 0) {
          await prisma.unit.updateMany({
            where: { id: { in: reservedUnitIds } },
            data: { status: 'reserved' },
          }).catch(() => {});
        }
        for (const chunk of chunkArray(statusHistoryRows, 250)) {
          await prisma.unitStatusHistory.createMany({ data: chunk }).catch(() => {});
        }

        // 3. Link unlinked invoices to their newly created leases (chunked updates)
        const leasesWithUnlinked = insertedBatch.filter((item) => item.unlinkedInvoiceIds.length > 0);
        for (let i = 0; i < leasesWithUnlinked.length; i += 10) {
          const slice = leasesWithUnlinked.slice(i, i + 10);
          await Promise.all(
            slice.map((item) =>
              prisma.invoice.updateMany({
                where: { id: { in: item.unlinkedInvoiceIds } },
                data: { leaseId: item.leaseData.id },
              }).catch(() => {})
            )
          );
        }

        // 4. Batch unit charges (createMany for new, grouped updateMany by amount for modified DB rows) & unitChargeHistory
        const newUnitChargesById = new Map<string, { id: string; unitId: string; chargeTypeId: string; amount: number }>();
        const updatedUnitChargesById = new Map<string, { id: string; amount: number }>();
        const allChargeHistories = insertedBatch.flatMap((item) => item.unitChargeHistories);

        for (const item of insertedBatch) {
          for (const op of item.unitChargeOps) {
            const stateKey = `${op.unitId}|${op.chargeTypeId}`;
            const state = unitChargeStateMap.get(stateKey);
            if (op.isNew || newUnitChargesById.has(op.id) || (state && !state.persistedInDb)) {
              newUnitChargesById.set(op.id, {
                id: op.id,
                unitId: op.unitId,
                chargeTypeId: op.chargeTypeId,
                amount: op.amount,
              });
              if (state) state.persistedInDb = true;
            } else {
              updatedUnitChargesById.set(op.id, { id: op.id, amount: op.amount });
            }
          }
        }

        if (newUnitChargesById.size > 0) {
          for (const chunk of chunkArray(Array.from(newUnitChargesById.values()), 250)) {
            await prisma.unitCharge.createMany({ data: chunk }).catch(() => {});
          }
        }

        if (updatedUnitChargesById.size > 0) {
          const idsByAmount = new Map<number, string[]>();
          for (const u of updatedUnitChargesById.values()) {
            let arr = idsByAmount.get(u.amount);
            if (!arr) {
              arr = [];
              idsByAmount.set(u.amount, arr);
            }
            arr.push(u.id);
          }
          const amountEntries = Array.from(idsByAmount.entries());
          for (let i = 0; i < amountEntries.length; i += 10) {
            const slice = amountEntries.slice(i, i + 10);
            await Promise.all(
              slice.map(([amt, ids]) =>
                prisma.unitCharge.updateMany({
                  where: { id: { in: ids } },
                  data: { amount: amt },
                }).catch(() => {})
              )
            );
          }
        }

        for (const chunk of chunkArray(allChargeHistories, 250)) {
          await prisma.unitChargeHistory.createMany({ data: chunk }).catch(() => {});
        }

        // 5. Batch billing schedules
        const allSchedules = insertedBatch.flatMap((item) => item.schedulesToCreate);
        for (const chunk of chunkArray(allSchedules, 250)) {
          await prisma.billingSchedule.createMany({ data: chunk }).catch(() => {});
        }
      };

      const flushLeaseBatch = async (batch: PreparedLease[]) => {
        if (batch.length === 0) return;
        let insertedBatch: PreparedLease[] = [];
        try {
          await prisma.lease.createMany({
            data: batch.map((b) => b.leaseData),
          });
          imported += batch.length;
          insertedBatch = batch;
        } catch {
          for (const item of batch) {
            try {
              await prisma.lease.create({ data: item.leaseData });
              imported++;
              insertedBatch.push(item);
            } catch (e) {
              item.groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: [(e as Error).message] }));
            }
          }
        }

        await applySideEffectsForInsertedLeases(insertedBatch);
      };

      for (const [_groupKey, groupRows] of groups.entries()) {
        const headerRow = groupRows[0];
        const d = headerRow.data;
        const leaseNum = (d.leaseNumber || '').trim();
        const lNum = leaseNum.toLowerCase();
        const tCode = (d.tenantCode || '').trim().toLowerCase();
        const tName = (d.tenantName || '').trim().toLowerCase();

        const isExistingLeaseTenant =
          (tCode && knownLeaseTenant.has(`${lNum}|${tCode}`)) ||
          (tName && knownLeaseTenant.has(`${lNum}|${tName}`));

        if (isExistingLeaseTenant || (lNum && knownLeaseNumbers.has(lNum))) {
          skipped += groupRows.length;
          skippedLeases++;
          const skipMsg = isExistingLeaseTenant
            ? `Lease Number "${leaseNum}" and Tenant "${d.tenantCode || d.tenantName || ''}" already exist - skipped`
            : `Lease Number "${leaseNum}" already exists - skipped`;
          groupRows.forEach((gr) => notes.push({ rowNo: gr.rowNo, message: skipMsg }));
          continue;
        }

        try {
          // Target property
          let targetPropertyId = propertyId;
          const propRaw = (d.propertyCode || d.property || '').trim().toLowerCase();
          if (propRaw) {
            const matched = propByCode.get(propRaw) || propByName.get(propRaw);
            if (matched) {
              targetPropertyId = matched;
            }
          }

          // Target tenant
          const targetTenant = tenantMap.get(tCode) || (tName ? tenantByName.get(tName) : undefined);
          if (!targetTenant) {
            groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: [`Tenant "${d.tenantCode || d.tenantName}" not found`] }));
            continue;
          }
          if (targetTenant.isBlacklisted) {
            groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: [`Tenant "${d.tenantCode || d.tenantName}" is blacklisted`] }));
            continue;
          }

          // Target unit
          const unit = unitMap.get(unitKey(targetPropertyId, (d.unitNumber || '').trim()));
          if (!unit) {
            groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: [`Unit "${d.unitNumber}" not found in property`] }));
            continue;
          }

          const startDate = parseDateStr(d.startDate);
          const endDate = parseDateStr(d.endDate);
          if (!startDate || !endDate) {
            groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: ['StartDate and EndDate are required and must be valid dates'] }));
            continue;
          }
          const handoverDate = parseDateStr(d.handoverDate);
          const contractStartDate = parseDateStr(d.contractStartDate);
          const contractEndDate = parseDateStr(d.contractEndDate);

          let termMonths = optNum(d.leaseTermMonths);
          if (!termMonths || termMonths <= 0) {
            termMonths = calcLeaseTermMonths(startDate, endDate);
          }
          const effectiveTermMonths = termMonths && termMonths > 0 ? Math.max(1, Math.round(termMonths)) : 1;

          const rent = num(d.rentAmount);
          if (rent === null || isNaN(rent)) {
            groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: ['RentAmount must be a valid number'] }));
            continue;
          }

          const status = d.status ? norm(d.status) : 'active';
          const currency = (d.currency?.trim() || 'USD').toUpperCase();

          const rentalAgreement = (contractStartDate || contractEndDate)
            ? {
                contractStartDate: contractStartDate ? contractStartDate.toISOString().slice(0, 10) : null,
                contractEndDate: contractEndDate ? contractEndDate.toISOString().slice(0, 10) : null,
              }
            : undefined;

          const finalLeaseNumber = leaseNum || nextLeaseNumber();
          const createdLeaseId = randomUUID();

          // -if lease status is Active>>unit status must be occupied, if draft unit status is reserved
          let targetUnitStatus: string | null = null;
          if (status === 'active') {
            targetUnitStatus = 'occupied';
          } else if (status === 'draft') {
            targetUnitStatus = 'reserved';
          }

          let unitStatusChange: PreparedLease['unitStatusChange'];
          if (targetUnitStatus && unit.status !== targetUnitStatus) {
            unitStatusChange = {
              unitId: unit.id,
              propertyId: targetPropertyId,
              fromStatus: unit.status,
              toStatus: targetUnitStatus,
              reason: `Lease import (${finalLeaseNumber}, status: ${status})`,
            };
            unit.status = targetUnitStatus;
          }

          const resolvedFloorLabel =
            unit.floorLabel ||
            (unit.floorNumber != null ? floorLabelMap.get(`${targetPropertyId}|${unit.floorNumber}`) : undefined) ||
            (unit.floorNumber != null ? `Floor ${unit.floorNumber}` : '');
          const unitFloorLabel = resolvedFloorLabel
            ? `${resolvedFloorLabel} · Unit ${unit.unitNumber}`
            : `Unit ${unit.unitNumber}`;

          // Collect existing non-void invoices belonging to this contract
          const candidateInvoices = new Map<string, LeaseCandidateInvoice>();
          for (const inv of invoicesByUnitTenant.get(`${unit.id}|${targetTenant.id}`) || []) {
            candidateInvoices.set(inv.id, inv);
          }
          const finalNumLower = finalLeaseNumber.trim().toLowerCase();
          if (finalNumLower) {
            for (const inv of invoicesBySecondRef.get(finalNumLower) || []) {
              candidateInvoices.set(inv.id, inv);
            }
          }

          const contractStartGrace = new Date(startDate.getTime() - 7 * 86_400_000);
          const contractInvoices = Array.from(candidateInvoices.values()).filter((inv) => {
            if (inv.leaseId === createdLeaseId) return true;
            if (finalNumLower && inv.secondRef && inv.secondRef.trim().toLowerCase() === finalNumLower) {
              return true;
            }
            if (finalNumLower && inv.notes && inv.notes.toLowerCase().includes(finalNumLower)) {
              return true;
            }
            if (inv.periodFrom && inv.periodFrom >= contractStartGrace && inv.periodFrom <= endDate) {
              return true;
            }
            if (inv.periodTo && inv.periodTo > startDate && inv.periodTo <= endDate) {
              return true;
            }
            const hasLineInContract = inv.lines.some((ln) => {
              if (ln.periodFrom && ln.periodFrom >= contractStartGrace && ln.periodFrom <= endDate) return true;
              if (ln.periodTo && ln.periodTo > startDate && ln.periodTo <= endDate) return true;
              return false;
            });
            if (hasLineInContract) return true;
            const hasAnyPeriod = Boolean(inv.periodFrom || inv.periodTo || inv.lines.some((ln) => ln.periodFrom || ln.periodTo));
            if (!hasAnyPeriod && inv.invoiceDate >= contractStartGrace && inv.invoiceDate <= endDate) {
              return true;
            }
            return false;
          });

          const unlinkedInvoiceIds = contractInvoices.filter((inv) => !inv.leaseId).map((inv) => inv.id);
          for (const inv of contractInvoices) {
            if (!inv.leaseId) inv.leaseId = createdLeaseId;
          }

          const unitChargeOps: PreparedLease['unitChargeOps'] = [];
          const unitChargeHistories: PreparedLease['unitChargeHistories'] = [];
          const schedulesToCreate: PreparedLease['schedulesToCreate'] = [];
          const pendingNotes: PreparedLease['pendingNotes'] = [];
          const scheduledChargeTypesForLease = new Set<string>();

          // -lease with charges need to add charges at corresponding unit
          // -Rent is not Charges >> that is base rent only
          // -if lease status is Active>>charges are need to schedule (advancing nextBillingDate past already-invoiced months)
          for (const gr of groupRows) {
            const chgCode = (gr.data.chargesCode || gr.data.chargeCode || '').trim();
            const chgAmount = num(gr.data.chargesAmount || gr.data.chargeAmount);
            if (chgCode && chgAmount !== null && !isNaN(chgAmount)) {
              const ct = chargeTypeByCode.get(chgCode.toLowerCase());
              if (!ct) {
                pendingNotes.push({ rowNo: gr.rowNo, message: `Charges Code "${chgCode}" not found in Charges Setup - skipped charge` });
                continue;
              }

              // Rent is Base Rent only — never enter as a unit/lease charge
              if (isRentChargeType(ct)) {
                pendingNotes.push({ rowNo: gr.rowNo, message: `Charge "${ct.name}" (${ct.code}) is Base Rent — excluded from lease charges` });
                continue;
              }

              // 1. Add / update charge at corresponding unit (tracked in memory & flushed in batch)
              const ucKey = `${unit.id}|${ct.id}`;
              const existingUC = unitChargeStateMap.get(ucKey);
              if (existingUC) {
                unitChargeHistories.push({
                  id: randomUUID(),
                  unitId: unit.id,
                  action: 'modified',
                  chargeTypeId: ct.id,
                  amount: chgAmount,
                  oldChargeTypeId: existingUC.chargeTypeId,
                  oldAmount: existingUC.amount,
                  changedBy: userId,
                });
                existingUC.amount = chgAmount;
                unitChargeOps.push({
                  id: existingUC.id,
                  unitId: unit.id,
                  chargeTypeId: ct.id,
                  amount: chgAmount,
                  isNew: false,
                });
              } else {
                const newUcId = randomUUID();
                unitChargeStateMap.set(ucKey, {
                  id: newUcId,
                  unitId: unit.id,
                  chargeTypeId: ct.id,
                  amount: chgAmount,
                  persistedInDb: false,
                });
                unitChargeOps.push({
                  id: newUcId,
                  unitId: unit.id,
                  chargeTypeId: ct.id,
                  amount: chgAmount,
                  isNew: true,
                });
                unitChargeHistories.push({
                  id: randomUUID(),
                  unitId: unit.id,
                  action: 'added',
                  chargeTypeId: ct.id,
                  amount: chgAmount,
                  oldChargeTypeId: null,
                  oldAmount: null,
                  changedBy: userId,
                });
              }

              // 2. If lease status is Active >> schedule charge starting from the first un-invoiced month
              if (status === 'active' && !scheduledChargeTypesForLease.has(ct.id)) {
                let latestPeriodFrom: Date | null = null;
                let latestPeriodTo: Date | null = null;
                let latestInvDate: Date | null = null;
                let matchedChargeLinesCount = 0;

                for (const inv of contractInvoices) {
                  for (const ln of inv.lines) {
                    if (doesLineMatchCharge(ln, ct)) {
                      matchedChargeLinesCount++;
                      const pf = ln.periodFrom || inv.periodFrom;
                      const pt = ln.periodTo || inv.periodTo;
                      if (pf && (!latestPeriodFrom || pf > latestPeriodFrom)) {
                        latestPeriodFrom = pf;
                      }
                      if (pt && (!latestPeriodTo || pt > latestPeriodTo)) {
                        latestPeriodTo = pt;
                      }
                      if (!pf && !pt && (!latestInvDate || inv.invoiceDate > latestInvDate)) {
                        latestInvDate = inv.invoiceDate;
                      }
                    }
                  }
                }

                const isDepositCharge =
                  (ct.category || '').toLowerCase() === 'deposit' ||
                  /^D\d{4}/i.test(ct.code) ||
                  (ct.name || '').toLowerCase().includes('deposit');

                if (isDepositCharge && matchedChargeLinesCount > 0) {
                  pendingNotes.push({
                    rowNo: gr.rowNo,
                    message: `Charge "${ct.name}" already has a generated invoice — schedule skipped`,
                  });
                  continue;
                }

                const chargeNextBillingDate = computeNextUnbilledMonth(
                  startDate,
                  latestPeriodFrom,
                  latestPeriodTo,
                  latestInvDate,
                );

                if (chargeNextBillingDate > endDate) {
                  pendingNotes.push({
                    rowNo: gr.rowNo,
                    message: `Charge "${ct.name}" is already invoiced through the end of the lease term — schedule skipped`,
                  });
                  continue;
                }

                scheduledChargeTypesForLease.add(ct.id);
                schedulesToCreate.push({
                  id: randomUUID(),
                  companyId,
                  propertyId: targetPropertyId,
                  unitId: unit.id,
                  tenantId: targetTenant.id,
                  leaseId: createdLeaseId,
                  chargeTypeId: ct.id,
                  description: `${ct.name} — ${unitFloorLabel}`,
                  amount: chgAmount,
                  quantity: 1,
                  currency,
                  billingCycle: 'monthly',
                  billingDay: 1,
                  paymentDueDays: 7,
                  startDate,
                  endDate,
                  nextBillingDate: chargeNextBillingDate,
                  status: 'active',
                  createdBy: userId,
                });
              }
            }
          }

          // -Rent is not Charges >> that is base rent only
          // -If full term Rent amount (rent * termMonths) is already invoiced, skip Rent schedule
          // -If partially invoiced (0 < invoicedRentAmount < totalTermRent), schedule only the remaining rent amount
          const totalTermRent = Math.round(rent * effectiveTermMonths * 100) / 100;
          let invoicedRentAmount = 0;
          let latestRentPeriodFrom: Date | null = null;
          let latestRentPeriodTo: Date | null = null;
          let latestRentInvDate: Date | null = null;
          const matchedRentInvNumbers: string[] = [];

          for (const inv of contractInvoices) {
            let invHasRent = false;
            for (const ln of inv.lines) {
              if (isRentInvoiceLine(ln)) {
                invHasRent = true;
                invoicedRentAmount += Number(ln.amount ?? ln.lineTotal ?? 0);
                const pf = ln.periodFrom || inv.periodFrom;
                const pt = ln.periodTo || inv.periodTo;
                if (pf && (!latestRentPeriodFrom || pf > latestRentPeriodFrom)) {
                  latestRentPeriodFrom = pf;
                }
                if (pt && (!latestRentPeriodTo || pt > latestRentPeriodTo)) {
                  latestRentPeriodTo = pt;
                }
                if (!pf && !pt && (!latestRentInvDate || inv.invoiceDate > latestRentInvDate)) {
                  latestRentInvDate = inv.invoiceDate;
                }
              }
            }
            if (invHasRent) {
              matchedRentInvNumbers.push(inv.invoiceNumber);
            }
          }
          invoicedRentAmount = Math.round(invoicedRentAmount * 100) / 100;

          if (totalTermRent > 0 && invoicedRentAmount >= totalTermRent) {
            pendingNotes.push({
              rowNo: headerRow.rowNo,
              message: `Full term Base Rent (${totalTermRent}) already has generated invoice (${matchedRentInvNumbers.join(', ')}) — Rent schedule skipped`,
            });
          } else if (status === 'active' && rent > 0 && totalTermRent > 0 && rentChargeType && !scheduledChargeTypesForLease.has(rentChargeType.id)) {
            const isPartialRentInvoiced = invoicedRentAmount > 0 && invoicedRentAmount < totalTermRent;
            const remainingRent = isPartialRentInvoiced
              ? Math.max(0, Math.round((totalTermRent - invoicedRentAmount) * 100) / 100)
              : rent;
            const monthsCovered = isPartialRentInvoiced
              ? Math.max(1, Math.floor((invoicedRentAmount + 0.009) / rent))
              : 0;
            const scheduleQty = isPartialRentInvoiced
              ? Math.max(1, effectiveTermMonths - monthsCovered)
              : effectiveTermMonths;

            let rentNextBillingDate = startDate;
            if (isPartialRentInvoiced) {
              const fromPeriod = computeNextUnbilledMonth(
                startDate,
                latestRentPeriodFrom,
                latestRentPeriodTo,
                latestRentInvDate,
              );
              let fromMonthsCovered = startDate;
              for (let i = 0; i < monthsCovered; i++) {
                fromMonthsCovered = billingSchedulesService.computeNextBillingDateFromStart(fromMonthsCovered, 'monthly', 1);
              }
              rentNextBillingDate = fromPeriod > fromMonthsCovered ? fromPeriod : fromMonthsCovered;
              if (rentNextBillingDate > endDate) {
                rentNextBillingDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
                if (rentNextBillingDate < startDate) rentNextBillingDate = startDate;
              }
            }

            scheduledChargeTypesForLease.add(rentChargeType.id);
            schedulesToCreate.push({
              id: randomUUID(),
              companyId,
              propertyId: targetPropertyId,
              unitId: unit.id,
              tenantId: targetTenant.id,
              leaseId: createdLeaseId,
              chargeTypeId: rentChargeType.id,
              description: isPartialRentInvoiced
                ? `Rent (Remaining Balance) — ${unitFloorLabel}`
                : `Rent — ${unitFloorLabel}`,
              amount: remainingRent,
              quantity: scheduleQty,
              currency,
              billingCycle: 'monthly',
              billingDay: 1,
              paymentDueDays: 7,
              startDate,
              endDate,
              nextBillingDate: rentNextBillingDate,
              status: 'active',
              createdBy: userId,
            });

            if (isPartialRentInvoiced) {
              pendingNotes.push({
                rowNo: headerRow.rowNo,
                message: `Partial Base Rent (${invoicedRentAmount} of ${totalTermRent}) invoiced (${matchedRentInvNumbers.join(', ')}) — scheduled remaining ${remainingRent}`,
              });
            }
          }

          const finalNumKey = finalLeaseNumber.trim().toLowerCase();
          knownLeaseNumbers.add(finalNumKey);
          knownLeaseTenant.add(`${finalNumKey}|${targetTenant.id.toLowerCase()}`);
          if (targetTenant.code) knownLeaseTenant.add(`${finalNumKey}|${targetTenant.code.trim().toLowerCase()}`);
          if (targetTenant.companyName) knownLeaseTenant.add(`${finalNumKey}|${targetTenant.companyName.trim().toLowerCase()}`);
          const fullName = `${targetTenant.firstName || ''} ${targetTenant.lastName || ''}`.trim().toLowerCase();
          if (fullName) knownLeaseTenant.add(`${finalNumKey}|${fullName}`);

          pendingLeaseBatch.push({
            groupRows,
            leaseData: {
              id: createdLeaseId,
              companyId,
              propertyId: targetPropertyId,
              unitId: unit.id,
              tenantId: targetTenant.id,
              leaseNumber: finalLeaseNumber,
              status,
              startDate,
              endDate,
              handoverDate,
              leaseTermMonths: effectiveTermMonths,
              rentAmount: rent,
              currency,
              rentalAgreement: rentalAgreement ?? undefined,
              createdBy: userId,
            },
            unitStatusChange,
            unlinkedInvoiceIds,
            unitChargeOps,
            unitChargeHistories,
            schedulesToCreate,
            pendingNotes,
          });

          if (pendingLeaseBatch.length >= LEASE_BATCH_SIZE) {
            await flushLeaseBatch(pendingLeaseBatch);
            pendingLeaseBatch = [];
          }
        } catch (e) {
          groupRows.forEach((gr) => failed.push({ rowNo: gr.rowNo, errors: [(e as Error).message] }));
        }
      }

      if (pendingLeaseBatch.length > 0) {
        await flushLeaseBatch(pendingLeaseBatch);
      }

      if (touchedPropertyIds.size > 0) {
        await Promise.all(
          Array.from(touchedPropertyIds).map((pid) => unitsService.invalidateStatsCache(pid).catch(() => {}))
        );
      }
    } else if (normType === 'charge') {
      const [existingCharges, categories] = await Promise.all([
        prisma.chargeType.findMany({
          where: { OR: [{ companyId }, { companyId: null }] },
          select: { code: true },
        }),
        prisma.chargeCategory.findMany({
          where: { OR: [{ companyId }, { companyId: null }] },
          select: { code: true, description: true },
        }),
      ]);

      const knownCodes = new Set(existingCharges.map((c) => c.code.trim().toLowerCase()));
      const catMap = new Map<string, string>();
      for (const cat of categories) {
        catMap.set(cat.code.trim().toLowerCase(), cat.code);
        if (cat.description) catMap.set(cat.description.trim().toLowerCase(), cat.code);
      }

      for (const r of valid) {
        const d = r.data;
        const code = d.code.trim();
        const k = code.toLowerCase();

        if (knownCodes.has(k)) {
          skipped++;
          notes.push({ rowNo: r.rowNo, message: `Charges Code "${code}" already exists - skipped` });
          continue;
        }

        const isTaxable = ['yes', 'true', '1', 'y', 't'].includes((d.isTaxable || '').trim().toLowerCase());
        const rawCat = (d.category || '').trim();
        let matchedCat = catMap.get(rawCat.toLowerCase()) || (rawCat ? norm(rawCat).slice(0, 50) : 'misc');

        if (rawCat && !catMap.has(rawCat.toLowerCase())) {
          try {
            await prisma.chargeCategory.create({
              data: {
                companyId,
                code: matchedCat,
                description: rawCat.slice(0, 255),
                monthly: false,
                isActive: true,
                isSystem: false,
              },
            });
            catMap.set(rawCat.toLowerCase(), matchedCat);
          } catch {
            // Category might already exist or conflict
          }
        }

        try {
          await prisma.chargeType.create({
            data: {
              companyId,
              code,
              name: d.name.trim(),
              category: matchedCat || 'misc',
              glAccountCode: d.glAccountCode?.trim() || null,
              isTaxable,
              taxRate: 0,
              isActive: true,
              isSystem: false,
            },
          });
          knownCodes.add(k);
          imported++;
        } catch (e) {
          failed.push({ rowNo: r.rowNo, errors: [(e as Error).message] });
        }
      }
    }

    failed.sort((a, b) => a.rowNo - b.rowNo);
    return {
      type: normType,
      total: rows.length,
      imported,
      skipped,
      linked,
      linkSkipped,
      notes,
      failed,
      skippedLeases,
      unitChargesCount,
      billingSchedulesCount,
      unitStatusUpdated,
    };
  },
};
