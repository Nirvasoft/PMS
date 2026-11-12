import { prisma } from '../../common/database';
import { ensurePropertySetupScope, resolveEffectivePropertyId } from '../../common/propertySetupScope';

export const ACCOUNTING_INTEGRATION_TYPES = [
  'v6erp',
  'sap',
  'netsuite',
  'dynamics365',
  'quickbooks',
  'xero',
] as const;

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

/**
 * Checks whether any ERP or Accounting integration (V6 ERP, SAP, NetSuite, Dynamics 365, QuickBooks, Xero)
 * is currently enabled/active for a company (and active property when scoped).
 */
export async function isAccountingIntegrationActive(
  companyId: string,
  propertyId?: string | null,
): Promise<boolean> {
  await ensurePropertySetupScope();
  const effectivePropertyId = await resolveEffectivePropertyId(companyId, propertyId);

  if (effectivePropertyId) {
    const exactConfig = await prisma.integrationConfig.findFirst({
      where: {
        companyId,
        OR: [{ propertyId: effectivePropertyId }, { propertyId: null }],
        integrationType: { in: [...ACCOUNTING_INTEGRATION_TYPES] },
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
      integrationType: { in: [...ACCOUNTING_INTEGRATION_TYPES] },
      status: { not: 'disabled' },
      isActive: true,
    },
    select: { id: true },
  });
  return Boolean(anyActiveConfig);
}
