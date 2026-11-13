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
 * Automatically turns OFF `property.settings.useAccountAndJournalEntry` for the target property
 * (or all company properties if propertyId is omitted) when V6 ERP integration is active.
 */
export async function disablePropertyAccountAndJournalFlag(
  companyId: string,
  propertyId?: string | null,
): Promise<void> {
  if (!companyId) return;
  const where: Record<string, unknown> = { companyId, deletedAt: null };
  if (propertyId) where.id = propertyId;

  const props = await prisma.property.findMany({
    where,
    select: { id: true, settings: true },
  });

  for (const prop of props) {
    const propSettings =
      prop.settings && typeof prop.settings === 'object' && !Array.isArray(prop.settings)
        ? (prop.settings as Record<string, unknown>)
        : {};
    if (propSettings.useAccountAndJournalEntry === true) {
      await prisma.property.update({
        where: { id: prop.id },
        data: {
          settings: {
            ...propSettings,
            useAccountAndJournalEntry: false,
          },
        },
      });
    }
  }
}

/**
 * Checks whether V6 ERP integration is currently enabled/active for the specified property
 * (or the company's effective property when propertyId is omitted).
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
    return Boolean(exactConfig);
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
 * Checks whether Account, Department, Cost Center, and Journal Entry features should be active
 * for the given property:
 * - True when any ERP/Accounting integration (e.g. V6 ERP) is active for that property, OR
 * - True when V6/ERP integration is disabled/inactive and Property Settings ->
 *   "Use Account and Journal Entry" (`property.settings.useAccountAndJournalEntry`) is enabled.
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
      select: { id: true, integrationType: true },
    });
    if (exactConfig) {
      if (exactConfig.integrationType === 'v6erp') {
        await disablePropertyAccountAndJournalFlag(companyId, effectivePropertyId).catch(() => {});
      }
      return true;
    }

    const prop = await prisma.property.findFirst({
      where: { id: effectivePropertyId, companyId, deletedAt: null },
      select: { settings: true },
    });
    const propSettings =
      prop?.settings && typeof prop.settings === 'object' && !Array.isArray(prop.settings)
        ? (prop.settings as Record<string, unknown>)
        : {};
    return propSettings.useAccountAndJournalEntry === true;
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
