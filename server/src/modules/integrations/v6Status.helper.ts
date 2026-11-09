import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

/**
 * Checks whether V6 ERP integration is currently enabled/active for a company (and active property when scoped).
 */
export async function isV6ErpActive(companyId: string, propertyId?: string | null): Promise<boolean> {
  await ensurePropertySetupScope();
  const effectivePropertyId = await resolveEffectivePropertyId(companyId, propertyId);

  const v6Config = await prisma.integrationConfig.findFirst({
    where: {
      companyId,
      ...(effectivePropertyId
        ? { OR: [{ propertyId: effectivePropertyId }, { propertyId: null }] }
        : {}),
      integrationType: 'v6erp',
      status: { not: 'disabled' },
      isActive: true,
    },
    select: { id: true },
  });
  return Boolean(v6Config);
}

/**
 * Throws a 400 V6_SYNC_ACTIVE error when V6 ERP integration is active for the company / property.
 */
export async function assertV6ErpNotActive(
  companyId: string,
  featureLabel: string,
  propertyId?: string | null,
): Promise<void> {
  if (await isV6ErpActive(companyId, propertyId)) {
    throw AppError.badRequest(
      `${featureLabel} creation is disabled because V6 ERP integration is active.`,
      'V6_SYNC_ACTIVE',
    );
  }
}
