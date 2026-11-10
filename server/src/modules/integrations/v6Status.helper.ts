import { prisma } from '../../common/database';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

/**
 * Checks whether V6 ERP integration is currently enabled/active for a company (and active property when scoped).
 */
export async function isV6ErpActive(companyId: string, propertyId?: string | null): Promise<boolean> {
  await ensurePropertySetupScope();
  const effectivePropertyId = await resolveEffectivePropertyId(companyId, propertyId);

  if (effectivePropertyId) {
    const exactConfig = await prisma.integrationConfig.findFirst({
      where: {
        companyId,
        OR: [{ propertyId: effectivePropertyId }, { propertyId: null }],
        integrationType: 'v6erp',
        status: { not: 'disabled' },
        isActive: true,
      },
      select: { id: true },
    });
    if (exactConfig) return true;
  }

  const anyActiveConfig = await prisma.integrationConfig.findFirst({
    where: {
      companyId,
      integrationType: 'v6erp',
      status: { not: 'disabled' },
      isActive: true,
    },
    select: { id: true },
  });
  return Boolean(anyActiveConfig);
}
