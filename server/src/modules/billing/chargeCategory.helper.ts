import { prisma } from '../../common/database';

export interface ChargeCategoryMeta {
  code: string;
  name: string;
  monthly: boolean;
}

const formatFallbackCategoryName = (code: string): string =>
  code
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase()) || 'Other';

/**
 * Resolves active ChargeCategory metadata keyed by lowercase code,
 * preferring property-specific definitions over company-wide and system-wide ones.
 */
export async function resolveChargeCategoryMap(
  companyId: string,
  propertyId?: string | null,
): Promise<Map<string, ChargeCategoryMeta>> {
  const rows = await prisma.chargeCategory.findMany({
    where: {
      isActive: true,
      OR: [
        { companyId: null },
        { companyId, isSystem: true, propertyId: null },
        ...(propertyId ? [{ companyId, propertyId }] : [{ companyId }]),
      ],
    },
    select: {
      companyId: true,
      propertyId: true,
      code: true,
      description: true,
      monthly: true,
    },
  });

  const priorityOf = (row: { companyId: string | null; propertyId: string | null }): number => {
    if (propertyId && row.propertyId === propertyId) return 3;
    if (row.companyId === companyId && !row.propertyId) return 2;
    if (row.companyId === null) return 1;
    return 0;
  };

  const best = new Map<string, { priority: number; meta: ChargeCategoryMeta }>();
  for (const row of rows) {
    const key = (row.code || '').trim().toLowerCase();
    if (!key) continue;
    const priority = priorityOf(row);
    const prev = best.get(key);
    if (!prev || priority > prev.priority) {
      best.set(key, {
        priority,
        meta: {
          code: row.code.trim(),
          name: row.description?.trim() || formatFallbackCategoryName(row.code),
          monthly: Boolean(row.monthly),
        },
      });
    }
  }

  const map = new Map<string, ChargeCategoryMeta>();
  for (const [key, entry] of best.entries()) {
    map.set(key, entry.meta);
  }
  return map;
}

export function isCategoryMonthly(
  catMap: Map<string, ChargeCategoryMeta>,
  categoryCode?: string | null,
): boolean {
  const key = (categoryCode || '').trim().toLowerCase();
  if (!key) return false;
  return Boolean(catMap.get(key)?.monthly);
}

export function getCategoryDisplayName(
  catMap: Map<string, ChargeCategoryMeta>,
  categoryCode?: string | null,
): string {
  const raw = (categoryCode || 'other').trim();
  const key = raw.toLowerCase();
  return catMap.get(key)?.name || formatFallbackCategoryName(raw);
}

/**
 * Finds (or creates) the ChargeType used for Base Rent on a lease,
 * preferring property-specific RENT before company/system fallbacks.
 */
export async function findLeaseRentChargeType(
  companyId: string,
  propertyId?: string | null,
) {
  const candidates = await prisma.chargeType.findMany({
    where: {
      isActive: true,
      AND: [
        {
          OR: [
            { code: { equals: 'RENT', mode: 'insensitive' } },
            { category: { equals: 'rent', mode: 'insensitive' } },
          ],
        },
        { OR: [{ companyId: null }, { companyId }] },
        ...(propertyId ? [{ OR: [{ propertyId }, { propertyId: null }] }] : []),
      ],
    },
  });

  if (candidates.length > 0) {
    const score = (ct: (typeof candidates)[number]) => {
      const exactCode = ct.code.trim().toUpperCase() === 'RENT' ? 10 : 0;
      const propMatch = propertyId && ct.propertyId === propertyId ? 5 : ct.propertyId == null ? 2 : 0;
      return exactCode + propMatch;
    };
    candidates.sort((a, b) => score(b) - score(a));
    return candidates[0];
  }

  return prisma.chargeType.create({
    data: { code: 'RENT', name: 'Rent', category: 'rent', isActive: true, isSystem: true },
  });
}

/**
 * Finds (or creates) the ChargeType used for Security Deposit on a lease,
 * preferring property-specific SECURITY_DEPOSIT / DEPOSIT before company/system fallbacks.
 */
export async function findLeaseDepositChargeType(
  companyId: string,
  propertyId?: string | null,
) {
  const candidates = await prisma.chargeType.findMany({
    where: {
      isActive: true,
      AND: [
        {
          OR: [
            { code: { equals: 'SECURITY_DEPOSIT', mode: 'insensitive' } },
            { code: { equals: 'DEPOSIT', mode: 'insensitive' } },
            { category: { equals: 'deposit', mode: 'insensitive' } },
          ],
        },
        { OR: [{ companyId: null }, { companyId }] },
        ...(propertyId ? [{ OR: [{ propertyId }, { propertyId: null }] }] : []),
      ],
    },
  });

  if (candidates.length > 0) {
    const score = (ct: (typeof candidates)[number]) => {
      const codeUpper = ct.code.trim().toUpperCase();
      const exactCode = codeUpper === 'SECURITY_DEPOSIT' ? 12 : codeUpper === 'DEPOSIT' ? 10 : 0;
      const propMatch = propertyId && ct.propertyId === propertyId ? 5 : ct.propertyId == null ? 2 : 0;
      return exactCode + propMatch;
    };
    candidates.sort((a, b) => score(b) - score(a));
    return candidates[0];
  }

  return prisma.chargeType.create({
    data: { code: 'SECURITY_DEPOSIT', name: 'Security Deposit', category: 'deposit', isActive: true, isSystem: true },
  });
}
