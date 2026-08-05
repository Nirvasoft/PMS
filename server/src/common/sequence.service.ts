/**
 * Company Sequence Service — generates company-scoped sequential numbers.
 *
 * Uses atomic upsert with increment to ensure no duplicates even under
 * concurrent requests. Supports configurable prefix and padding.
 *
 * Usage:
 *   const leaseNo = await sequenceService.next('company-uuid', 'lease');
 *   // → "LSE-2026-00001"
 *
 *   const invoiceNo = await sequenceService.next('company-uuid', 'invoice');
 *   // → "INV-2026-00001"
 */
import { prisma } from './database';
import { logger } from './logger';

/** Default prefixes for well-known sequence keys */
const DEFAULT_CONFIG: Record<string, { prefix: string; padLength: number }> = {
  lease:            { prefix: 'LSE',  padLength: 5 },
  invoice:          { prefix: 'INV',  padLength: 5 },
  receipt:          { prefix: 'RCT',  padLength: 5 },
  credit_note:      { prefix: 'CN',   padLength: 5 },
  work_order:       { prefix: 'WO',   padLength: 5 },
  ticket:           { prefix: 'TKT',  padLength: 6 },
  lead:             { prefix: 'LD',   padLength: 5 },
  tenant:           { prefix: 'TNT',  padLength: 5 },
  parking_pass:     { prefix: 'PP',   padLength: 5 },
};

class SequenceService {
  /**
   * Get the next sequential number for a given company + key.
   * Returns formatted string: PREFIX-YYYY-NNNNN
   *
   * @param companyId  - Company UUID
   * @param key        - Sequence key (e.g. 'lease', 'invoice', 'ticket')
   * @param overrides  - Optional overrides for prefix and pad length
   */
  async next(
    companyId: string,
    key: string,
    overrides?: { prefix?: string; padLength?: number },
  ): Promise<string> {
    const defaults = DEFAULT_CONFIG[key] || { prefix: key.toUpperCase().slice(0, 3), padLength: 5 };
    const prefix = overrides?.prefix ?? defaults.prefix;
    const padLength = overrides?.padLength ?? defaults.padLength;

    // Atomic upsert + increment
    const result = await prisma.$queryRaw<Array<{ current_val: bigint }>>`
      INSERT INTO company_sequences (company_id, sequence_key, prefix, pad_length, current_val, created_at, updated_at)
      VALUES (${companyId}::uuid, ${key}, ${prefix}, ${padLength}::smallint, 1, NOW(), NOW())
      ON CONFLICT (company_id, sequence_key)
      DO UPDATE SET current_val = company_sequences.current_val + 1, updated_at = NOW()
      RETURNING current_val
    `;

    const val = Number(result[0].current_val);
    const year = new Date().getFullYear();
    const padded = val.toString().padStart(padLength, '0');

    const formatted = `${prefix}-${year}-${padded}`;
    logger.debug(`Sequence ${key} for company ${companyId}: ${formatted}`);

    return formatted;
  }

  /**
   * Get the current value without incrementing (peek).
   */
  async current(companyId: string, key: string): Promise<number> {
    const row = await prisma.companySequence.findUnique({
      where: { companyId_sequenceKey: { companyId, sequenceKey: key } },
    });
    return row ? Number(row.currentVal) : 0;
  }

  /**
   * Reset a sequence to a specific value. Use with caution — for admin use only.
   */
  async reset(companyId: string, key: string, value: number): Promise<void> {
    await prisma.companySequence.upsert({
      where: { companyId_sequenceKey: { companyId, sequenceKey: key } },
      create: {
        companyId,
        sequenceKey: key,
        currentVal: value,
        prefix: DEFAULT_CONFIG[key]?.prefix || key.toUpperCase().slice(0, 3),
        padLength: DEFAULT_CONFIG[key]?.padLength || 5,
      },
      update: { currentVal: value },
    });
  }
}

export const sequenceService = new SequenceService();
