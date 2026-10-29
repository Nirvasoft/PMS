import { prisma } from '../../common/database';
import { AppError } from '../../common/errors';

/**
 * Checks whether V6 ERP integration is currently enabled/active for a company.
 */
export async function isV6ErpActive(companyId: string): Promise<boolean> {
  const v6Config = await prisma.integrationConfig.findFirst({
    where: {
      companyId,
      integrationType: 'v6erp',
      status: { not: 'disabled' },
      isActive: true,
    },
    select: { id: true },
  });
  return Boolean(v6Config);
}

/**
 * Throws a 400 V6_SYNC_ACTIVE error when V6 ERP integration is active for the company.
 */
export async function assertV6ErpNotActive(companyId: string, featureLabel: string): Promise<void> {
  if (await isV6ErpActive(companyId)) {
    throw AppError.badRequest(
      `${featureLabel} creation is disabled because V6 ERP integration is active.`,
      'V6_SYNC_ACTIVE',
    );
  }
}
