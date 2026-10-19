/**
 * Company Sequence Service — generates company-scoped and property-scoped sequential numbers.
 *
 * Uses atomic upsert with increment to ensure no duplicates even under
 * concurrent requests. Supports configurable Prefix 1, Prefix 2 (date token),
 * padding length, and location/property scoping.
 *
 * Supported Date Formats for Prefix 2:
 * - 'none': No date in sequence (e.g. INV-000001)
 * - 'yymm': Document Date [yymm] (e.g. INV-2610-000001)
 * - 'mmyy': Document Date [mmyy] (e.g. INV-1026-000001)
 */
import { prisma } from './database';
import { logger } from './logger';

export type Prefix2Format = 'none' | 'yymm' | 'mmyy';
export type PrefixMode = 'auto' | 'manual';

export interface DocTypeDefinition {
  typeKey: string;
  label: string;
  module: string;
  defaultPrefix1: string;
  defaultPrefix2: Prefix2Format;
  defaultPad: number;
  defaultMode?: PrefixMode;
}

export interface SequenceItem {
  id: string; // sequenceKey in DB
  typeKey: string;
  label: string;
  module: string;
  locationId: string; // 'all' or property UUID
  prefix1: string;
  prefix2: Prefix2Format;
  padLength: number;
  currentVal: number;
  isCustom: boolean;
  samplePreview: string;
  mode?: PrefixMode;
}

export const PMS_DOCUMENT_TYPES: DocTypeDefinition[] = [
  // Organization
  { typeKey: 'tenant', label: 'Tenant Code', module: 'organization', defaultPrefix1: 'TNT', defaultPrefix2: 'none', defaultPad: 6, defaultMode: 'manual' },

  // Leasing
  { typeKey: 'lease', label: 'Lease Agreement', module: 'leasing', defaultPrefix1: 'LSE', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'quotation', label: 'Lease Quotation', module: 'leasing', defaultPrefix1: 'QUO', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'booking', label: 'Unit Booking', module: 'leasing', defaultPrefix1: 'BKG', defaultPrefix2: 'none', defaultPad: 6 },

  // CRM
  { typeKey: 'lead', label: 'CRM Lead', module: 'crm', defaultPrefix1: 'LD', defaultPrefix2: 'none', defaultPad: 6 },

  // Billing
  { typeKey: 'invoice', label: 'Sales Invoice', module: 'billing', defaultPrefix1: 'INV', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'receipt', label: 'Official Receipt', module: 'billing', defaultPrefix1: 'RCT', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'credit_note', label: 'Credit Note', module: 'billing', defaultPrefix1: 'CN', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'debit_note', label: 'Debit Note', module: 'billing', defaultPrefix1: 'DN', defaultPrefix2: 'none', defaultPad: 6 },

  // Maintenance
  { typeKey: 'ticket', label: 'Maintenance Ticket', module: 'maintenance', defaultPrefix1: 'TKT', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'work_order', label: 'Work Order', module: 'maintenance', defaultPrefix1: 'WO', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'inspection', label: 'Inspection Report', module: 'maintenance', defaultPrefix1: 'INS', defaultPrefix2: 'none', defaultPad: 6 },

  // Inventory
  { typeKey: 'purchase_requisition', label: 'Purchase Requisition', module: 'inventory', defaultPrefix1: 'PR', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'purchase_order', label: 'Purchase Order', module: 'inventory', defaultPrefix1: 'PO', defaultPrefix2: 'none', defaultPad: 6 },
  { typeKey: 'stock_movement', label: 'Stock Movement', module: 'inventory', defaultPrefix1: 'SM', defaultPrefix2: 'none', defaultPad: 6 },

  // Parking
  { typeKey: 'parking_pass', label: 'Parking Pass', module: 'parking', defaultPrefix1: 'PP', defaultPrefix2: 'none', defaultPad: 6 },

  // Security
  { typeKey: 'security_incident', label: 'Security Incident', module: 'security', defaultPrefix1: 'INC', defaultPrefix2: 'none', defaultPad: 6 },
];

export const DOC_TYPE_MAP: Record<string, DocTypeDefinition> = PMS_DOCUMENT_TYPES.reduce(
  (acc, item) => ({ ...acc, [item.typeKey]: item }),
  {} as Record<string, DocTypeDefinition>
);

/** Parse composite prefix stored in DB: "INV|yymm" or "TNT|none|auto" */
export function parseStoredPrefix(stored?: string | null): { prefix1: string; prefix2: Prefix2Format; mode: PrefixMode } {
  if (!stored) return { prefix1: '', prefix2: 'none', mode: 'manual' };
  const parts = stored.split('|');
  const prefix1 = parts[0]?.trim().toUpperCase() || '';
  const raw2 = (parts[1] || 'none').trim().toLowerCase();
  const prefix2: Prefix2Format = raw2 === 'yymm' || raw2 === 'mmyy' ? raw2 : 'none';
  const mode: PrefixMode = parts[2]?.trim().toLowerCase() === 'auto' ? 'auto' : 'manual';
  return { prefix1, prefix2, mode };
}

/** Encode prefix1 and prefix2 (plus optional mode) for DB storage: e.g. "INV|yymm" or "TNT|none|auto" */
export function encodePrefix(prefix1: string, prefix2: Prefix2Format, mode?: PrefixMode): string {
  const clean1 = (prefix1 || '').trim().toUpperCase();
  const clean2 = prefix2 || 'none';
  if (mode) {
    return `${clean1}|${clean2}|${mode}`;
  }
  return `${clean1}|${clean2}`;
}

/** Format a sequence string: [PREFIX1-][DATE-]NUMBER */
export function formatSequence(
  prefix1: string,
  prefix2: Prefix2Format,
  val: number,
  padLength: number,
  date: Date = new Date(),
): string {
  const cleanPrefix = (prefix1 || '').trim().toUpperCase();
  const cleanPad = Math.max(3, Math.min(10, padLength || 6));
  const paddedVal = String(val).padStart(cleanPad, '0');

  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');

  let datePart = '';
  if (prefix2 === 'yymm') {
    datePart = `${yy}${mm}`;
  } else if (prefix2 === 'mmyy') {
    datePart = `${mm}${yy}`;
  }

  return [cleanPrefix, datePart, paddedVal].filter(Boolean).join('-');
}

class SequenceService {
  /**
   * Get the next sequential number for a company/property and document key.
   * Format: PREFIX1-[YYMM]-000001
   *
   * @param companyId  - Company UUID
   * @param key        - Sequence key (e.g. 'invoice', 'receipt', 'lease')
   * @param options    - Optional overrides or propertyId/date
   */
  async next(
    companyId: string,
    key: string,
    options?: {
      propertyId?: string | null;
      date?: Date;
      prefix?: string;
      padLength?: number;
    },
  ): Promise<string> {
    const docDef = DOC_TYPE_MAP[key] || {
      typeKey: key,
      label: key,
      module: 'general',
      defaultPrefix1: key.toUpperCase().slice(0, 3),
      defaultPrefix2: 'none' as Prefix2Format,
      defaultPad: 6,
    };

    const docDate = options?.date || new Date();
    const propertyId = options?.propertyId;

    // Check if property-specific sequence exists
    let targetKey = key;
    if (propertyId) {
      const propSpecificKey = `${key}:${propertyId}`;
      const propRow = await prisma.companySequence.findUnique({
        where: { companyId_sequenceKey: { companyId, sequenceKey: propSpecificKey } },
      });
      if (propRow) {
        targetKey = propSpecificKey;
      }
    }

    const defaultCombined = options?.prefix !== undefined
      ? encodePrefix(options.prefix, 'none')
      : encodePrefix(docDef.defaultPrefix1, docDef.defaultPrefix2);
    const defaultPadLength = options?.padLength ?? docDef.defaultPad;

    // Atomic upsert + increment
    const result = await prisma.$queryRaw<Array<{ current_val: bigint; prefix: string | null; pad_length: number | null }>>`
      INSERT INTO company_sequences (company_id, sequence_key, prefix, pad_length, current_val, created_at, updated_at)
      VALUES (${companyId}::uuid, ${targetKey}, ${defaultCombined}, ${defaultPadLength}::smallint, 1, NOW(), NOW())
      ON CONFLICT (company_id, sequence_key)
      DO UPDATE SET current_val = company_sequences.current_val + 1, updated_at = NOW()
      RETURNING current_val, prefix, pad_length
    `;

    const row = result[0];
    const hasStored = row?.prefix != null;
    const { prefix1, prefix2 } = parseStoredPrefix(hasStored ? row.prefix : defaultCombined);
    const actualPrefix1 = hasStored ? prefix1 : (prefix1 || docDef.defaultPrefix1);
    const actualPad = (row?.pad_length && row.pad_length > 0) ? row.pad_length : defaultPadLength;
    const val = Number(row.current_val);

    const formatted = formatSequence(actualPrefix1, prefix2, val, actualPad, docDate);
    logger.debug(`Generated sequence for ${targetKey} (company: ${companyId}): ${formatted}`);

    return formatted;
  }

  /**
   * Get current value without incrementing
   */
  async current(companyId: string, key: string): Promise<number> {
    const row = await prisma.companySequence.findUnique({
      where: { companyId_sequenceKey: { companyId, sequenceKey: key } },
    });
    return row ? Number(row.currentVal) : 0;
  }

  /**
   * List all document sequences for a given location ('all' or property UUID) and module
   */
  async listSequences(companyId: string, locationId: string = 'all', moduleFilter?: string): Promise<SequenceItem[]> {
    const rows = await prisma.companySequence.findMany({
      where: { companyId },
    });

    const isAll = !locationId || locationId === 'all';
    const rowMap = new Map<string, (typeof rows)[0]>();

    for (const r of rows) {
      if (isAll) {
        // Company-wide keys do NOT have a colon
        if (!r.sequenceKey.includes(':')) {
          rowMap.set(r.sequenceKey, r);
        }
      } else {
        // Property-specific keys: e.g. "invoice:propUuid"
        if (r.sequenceKey.endsWith(`:${locationId}`)) {
          const typeKey = r.sequenceKey.split(':')[0];
          rowMap.set(typeKey, r);
        }
      }
    }

    const targetTypes = PMS_DOCUMENT_TYPES.filter((d) => {
      if (!moduleFilter || moduleFilter === 'all') return true;
      return d.module === moduleFilter;
    });

    const now = new Date();
    const results: SequenceItem[] = [];

    for (const doc of targetTypes) {
      const stored = rowMap.get(doc.typeKey);
      const isCustom = !!stored;
      const { prefix1, prefix2, mode } = parseStoredPrefix(stored ? stored.prefix : encodePrefix(doc.defaultPrefix1, doc.defaultPrefix2, doc.defaultMode));
      const resolvedPrefix1 = isCustom ? prefix1 : (prefix1 || doc.defaultPrefix1);
      const padLength = stored?.padLength || doc.defaultPad;
      const currentVal = stored ? Number(stored.currentVal) : 0;
      const samplePreview = formatSequence(resolvedPrefix1, prefix2, currentVal + 1, padLength, now);

      results.push({
        id: stored?.sequenceKey || (isAll ? doc.typeKey : `${doc.typeKey}:${locationId}`),
        typeKey: doc.typeKey,
        label: doc.label,
        module: doc.module,
        locationId: isAll ? 'all' : locationId,
        prefix1: resolvedPrefix1,
        prefix2,
        padLength,
        currentVal,
        isCustom,
        samplePreview,
        mode: mode || doc.defaultMode || 'manual',
      });

      rowMap.delete(doc.typeKey);
    }

    // Include custom non-standard keys if any
    for (const [key, stored] of rowMap.entries()) {
      const { prefix1, prefix2, mode } = parseStoredPrefix(stored.prefix);
      const padLength = stored.padLength || 6;
      const currentVal = Number(stored.currentVal);
      const samplePreview = formatSequence(prefix1, prefix2, currentVal + 1, padLength, now);

      results.push({
        id: stored.sequenceKey,
        typeKey: key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        module: 'custom',
        locationId: isAll ? 'all' : locationId,
        prefix1,
        prefix2,
        padLength,
        currentVal,
        isCustom: true,
        samplePreview,
        mode,
      });
    }

    return results;
  }

  /**
   * Bulk save prefix configurations for a given location
   */
  async bulkSave(
    companyId: string,
    locationId: string = 'all',
    items: Array<{
      typeKey: string;
      prefix1: string;
      prefix2: Prefix2Format;
      padLength: number;
      mode?: PrefixMode;
    }>,
  ): Promise<SequenceItem[]> {
    const isAll = !locationId || locationId === 'all';

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const cleanKey = isAll ? item.typeKey : `${item.typeKey}:${locationId}`;
        const combinedPrefix = encodePrefix(item.prefix1, item.prefix2 || 'none', item.mode);
        const cleanPad = Math.max(3, Math.min(10, Math.floor(item.padLength || 6)));

        await tx.companySequence.upsert({
          where: {
            companyId_sequenceKey: {
              companyId,
              sequenceKey: cleanKey,
            },
          },
          create: {
            companyId,
            sequenceKey: cleanKey,
            prefix: combinedPrefix,
            padLength: cleanPad,
            currentVal: 0,
          },
          update: {
            prefix: combinedPrefix,
            padLength: cleanPad,
          },
        });
      }
    });

    return this.listSequences(companyId, locationId);
  }

  /**
   * Delete a custom sequence configuration for a location
   */
  async deleteSequence(companyId: string, locationId: string = 'all', typeKey: string): Promise<boolean> {
    const isAll = !locationId || locationId === 'all';
    const sequenceKey = isAll ? typeKey : `${typeKey}:${locationId}`;

    try {
      await prisma.companySequence.delete({
        where: { companyId_sequenceKey: { companyId, sequenceKey } },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset a sequence counter to a given value (default 0)
   */
  async reset(companyId: string, sequenceKey: string, value: number = 0, locationId: string = 'all'): Promise<void> {
    const isAll = !locationId || locationId === 'all';
    const targetKey = isAll ? sequenceKey : (sequenceKey.includes(':') ? sequenceKey : `${sequenceKey}:${locationId}`);

    await prisma.companySequence.updateMany({
      where: {
        companyId,
        OR: [
          { sequenceKey: targetKey },
          { sequenceKey },
        ],
      },
      data: { currentVal: BigInt(Math.max(0, value)) },
    });
  }
}

export const sequenceService = new SequenceService();
