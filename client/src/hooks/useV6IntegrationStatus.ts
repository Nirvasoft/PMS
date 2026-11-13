import { useGetIntegrationsQuery } from '../store/api/integrationsApi';
import { useGetMyPropertyScopeQuery } from '../store/api/propertiesApi';
import { useSelectedPropertyId, ALL_PROPERTIES } from './useSelectedPropertyId';

export function useV6IntegrationStatus(overridePropertyId?: string) {
  const selectedPropertyId = useSelectedPropertyId();
  const cleanOverride =
    overridePropertyId && overridePropertyId !== ALL_PROPERTIES ? overridePropertyId : undefined;
  const propertyId = cleanOverride ?? selectedPropertyId;

  const { data: scopeRes, isLoading: scopeLoading } = useGetMyPropertyScopeQuery();
  const scopeProperties = scopeRes?.data || [];
  const targetProperty = propertyId
    ? scopeProperties.find((p) => p.id === propertyId)
    : scopeProperties[0];
  const effectivePropertyId = propertyId || targetProperty?.id;

  const { data: res, isLoading, isFetching } = useGetIntegrationsQuery(
    effectivePropertyId ? { propertyId: effectivePropertyId } : undefined,
  );

  const integrations = res?.data || [];
  const v6Exact = integrations.find(
    (i: any) => i.integrationType === 'v6erp' && i.isActive !== false && i.status !== 'disabled',
  );
  const v6 = v6Exact || integrations.find((i: any) => i.integrationType === 'v6erp');
  const isV6PushActive = Boolean(
    v6 && v6.isActive !== false && v6.status !== 'disabled',
  );

  const propSettings = (targetProperty?.settings ?? {}) as Record<string, unknown>;

  // When V6 ERP is active, Account / Dept / Cost Center checks & visibility and PMS Auto Journal
  // Entry are disabled (false). They are enabled ONLY when V6 is inactive and the per-property
  // "Use Account and Journal Entry" flag is turned ON.
  const useAccountAndJournalFlag = isV6PushActive
    ? false
    : propSettings.useAccountAndJournalEntry === true;
  const hasErpAccountingIntegration = isV6PushActive;
  const isAccountingIntegrationActive = useAccountAndJournalFlag;

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
