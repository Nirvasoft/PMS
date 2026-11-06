import { prisma } from '../../common/database';

/** Units in these statuses keep their shop identity (brand, logo, shopfront, category…). */
const IDENTITY_STATUSES = ['occupied', 'reserved'];

/** True when a unit stops being occupied/reserved, i.e. the previous shop identity no longer applies. */
export function shouldClearShopIdentity(fromStatus: string | null | undefined, toStatus: string): boolean {
  return IDENTITY_STATUSES.includes(String(fromStatus ?? '')) && !IDENTITY_STATUSES.includes(toStatus);
}

const clearedIdentityData = {
  brandName: null,
  tradeCategory: null,
  tradeSubcategory: null,
  franchiseGroup: null,
  logoUrl: null,
  shopfrontUrl: null,
  isAnchor: false,
  anchorType: null,
};

/**
 * Prisma operation that wipes the previous shop's identity from the given units' shop profiles.
 * Returned un-awaited so it can be added to an existing `prisma.$transaction([...])`.
 * The profile row itself (shop number, zone, POS ids…) is kept for the next tenant.
 */
export function clearShopIdentityOp(unitIds: string[]) {
  return prisma.shopProfile.updateMany({
    where: { unitId: { in: unitIds } },
    data: clearedIdentityData,
  });
}
