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
 * Checks whether PMS Account, Department, Cost Center, and Auto Journal Entry features
 * should be active for the given property:
 * - False whenever V6 ERP integration is active for that property (V6 handles accounting externally;
 *   PMS hides Account/Dept/CC fields, skips checks, and skips local Auto Journal Entry generation).
 * - True ONLY when V6 ERP integration is disabled/inactive AND Property Settings ->
 *   "Use Account and Journal Entry" (`property.settings.useAccountAndJournalEntry`) is enabled.
 */
export async function isAccountingIntegrationActive(
  companyId: string,
  propertyId?: string | null,
): Promise<boolean> {
  await ensurePropertySetupScope();
  const effectivePropertyId = await resolveEffectivePropertyId(companyId, propertyId);

  if (effectivePropertyId) {
    const v6Config = await prisma.integrationConfig.findFirst({
      where: {
        companyId,
        OR: [{ propertyId: effectivePropertyId }, { propertyId: null }],
        integrationType: 'v6erp',
        status: { not: 'disabled' },
        isActive: true,
      },
      select: { id: true },
    });
    if (v6Config) {
      await disablePropertyAccountAndJournalFlag(companyId, effectivePropertyId).catch(() => {});
      return false;
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

  return false;
}
