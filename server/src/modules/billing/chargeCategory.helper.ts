import { prisma } from '../../common/database';
import { resolveEffectivePropertyId } from '../../common/propertySetupScope';

export interface ChargeCategoryMeta {
  code: string;
  name: string;
  monthly: boolean;
}

export const SYSTEM_CHARGE_CATEGORIES: ReadonlyArray<{
  code: string;
  description: string;
  monthly: boolean;
  lockMonthly: boolean;
}> = [
  { code: 'rent', description: 'Rent', monthly: false, lockMonthly: false },
  { code: 'deposit', description: 'Deposit', monthly: false, lockMonthly: true },
  { code: 'utility', description: 'Utility', monthly: true, lockMonthly: true },
];

export function getSystemChargeCategoryDef(code?: string | null) {
  const normalized = (code || '').trim().toLowerCase();
  return SYSTEM_CHARGE_CATEGORIES.find((c) => c.code === normalized);
}

export function isSystemChargeCategoryCode(code?: string | null): boolean {
  return Boolean(getSystemChargeCategoryDef(code));
}

/**
 * Ensures the required system charge categories ('rent', 'deposit', 'utility') exist
 * and are marked `isSystem: true` for the given company and property scope,
 * while enforcing fixed monthly defaults for 'deposit' (false) and 'utility' (true).
 */
export async function ensureSystemChargeCategories(
  companyId: string,
  propertyId?: string | null,
): Promise<void> {
  if (!companyId) return;

  const targetPropertyId =
    propertyId && propertyId.trim()
      ? propertyId.trim()
      : await resolveEffectivePropertyId(companyId, undefined);

  // 1. Mark any existing 'rent', 'deposit', 'utility' categories as isSystem = true
  // and enforce locked monthly values (deposit -> false, utility -> true)
  await prisma.chargeCategory.updateMany({
    where: {
      companyId,
      OR: SYSTEM_CHARGE_CATEGORIES.map((c) => ({
        code: { equals: c.code, mode: 'insensitive' as const },
      })),
      isSystem: false,
    },
    data: { isSystem: true },
  });

  for (const def of SYSTEM_CHARGE_CATEGORIES) {
    if (!def.lockMonthly) continue;
    await prisma.chargeCategory.updateMany({
      where: {
        companyId,
        code: { equals: def.code, mode: 'insensitive' },
        monthly: { not: def.monthly },
      },
      data: { monthly: def.monthly, isSystem: true },
    });
  }

  // 2. If the company has an active property, migrate or clean up any company-level (propertyId = null) system categories
  if (targetPropertyId) {
    const nullPropRows = await prisma.chargeCategory.findMany({
      where: {
        companyId,
        propertyId: null,
        OR: SYSTEM_CHARGE_CATEGORIES.map((c) => ({
          code: { equals: c.code, mode: 'insensitive' as const },
        })),
      },
    });

    for (const row of nullPropRows) {
      const existingOnProp = await prisma.chargeCategory.findFirst({
        where: {
          companyId,
          propertyId: targetPropertyId,
          code: { equals: row.code, mode: 'insensitive' },
        },
      });
      if (!existingOnProp) {
        const def = getSystemChargeCategoryDef(row.code);
        await prisma.chargeCategory.update({
          where: { id: row.id },
          data: {
            propertyId: targetPropertyId,
            isSystem: true,
            ...(def?.lockMonthly ? { monthly: def.monthly } : {}),
          },
        });
      } else {
        await prisma.chargeCategory.delete({ where: { id: row.id } }).catch(() => {});
      }
    }
  }

  // 3. Ensure 'rent', 'deposit', and 'utility' exist on targetPropertyId (or propertyId = null if company has no properties yet)
  const existing = await prisma.chargeCategory.findMany({
    where: {
      companyId,
      propertyId: targetPropertyId,
      OR: SYSTEM_CHARGE_CATEGORIES.map((c) => ({
        code: { equals: c.code, mode: 'insensitive' as const },
      })),
    },
    select: { id: true, code: true, isActive: true, monthly: true },
  });

  for (const def of SYSTEM_CHARGE_CATEGORIES) {
    const match = existing.find((e) => e.code.trim().toLowerCase() === def.code);
    if (!match) {
      await prisma.chargeCategory
        .create({
          data: {
            companyId,
            propertyId: targetPropertyId,
            code: def.code,
            description: def.description,
            monthly: def.monthly,
            isActive: true,
            isSystem: true,
          },
        })
        .catch(() => {});
    } else if (!match.isActive || (def.lockMonthly && match.monthly !== def.monthly)) {
      await prisma.chargeCategory
        .update({
          where: { id: match.id },
          data: {
            isActive: true,
            isSystem: true,
            ...(def.lockMonthly ? { monthly: def.monthly } : {}),
          },
        })
        .catch(() => {});
    }
  }
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
  await ensureSystemChargeCategories(companyId, propertyId);
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
