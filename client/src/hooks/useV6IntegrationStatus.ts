import { useGetIntegrationsQuery } from '../store/api/integrationsApi';
import { useGetMyPropertyScopeQuery } from '../store/api/propertiesApi';
import { useSelectedPropertyId, ALL_PROPERTIES } from './useSelectedPropertyId';

const ACCOUNTING_INTEGRATION_TYPES = new Set([
  'v6erp',
  'sap',
  'netsuite',
  'dynamics365',
  'quickbooks',
  'xero',
]);

export function useV6IntegrationStatus(overridePropertyId?: string) {
  const selectedPropertyId = useSelectedPropertyId();
  const cleanOverride =
    overridePropertyId && overridePropertyId !== ALL_PROPERTIES ? overridePropertyId : undefined;
  const propertyId = cleanOverride ?? selectedPropertyId;

  const { data: res, isLoading, isFetching } = useGetIntegrationsQuery(
    propertyId ? { propertyId } : undefined,
  );
  const { data: scopeRes, isLoading: scopeLoading } = useGetMyPropertyScopeQuery();

  const integrations = res?.data || [];
  const v6Exact = integrations.find(
    (i: any) => i.integrationType === 'v6erp' && i.isActive !== false && i.status !== 'disabled',
  );
  const v6 = v6Exact || integrations.find((i: any) => i.integrationType === 'v6erp');
  const isV6PushActive = Boolean(
    v6 && v6.isActive !== false && v6.status !== 'disabled',
  );

  const acctExact = integrations.find(
    (i: any) =>
      ACCOUNTING_INTEGRATION_TYPES.has(i.integrationType) &&
      i.isActive !== false &&
      i.status !== 'disabled',
  );

  const scopeProperties = scopeRes?.data || [];
  const targetProperty = propertyId
    ? scopeProperties.find((p) => p.id === propertyId)
    : scopeProperties[0];
  const propSettings = (targetProperty?.settings ?? {}) as Record<string, unknown>;

  const useAccountAndJournalFlag = isV6PushActive
    ? false
    : propSettings.useAccountAndJournalEntry === true;
  const hasErpAccountingIntegration = Boolean(acctExact);
  const isAccountingIntegrationActive = hasErpAccountingIntegration || useAccountAndJournalFlag;

  return {
    isV6Active: isV6PushActive,
    isV6PushActive,
    isAccountingIntegrationActive,
    hasErpAccountingIntegration,
    useAccountAndJournalFlag,
    v6Config: v6,
    isLoading: isLoading || isFetching || scopeLoading,
  };
}
