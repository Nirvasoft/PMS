import { useGetIntegrationsQuery } from '../store/api/integrationsApi';
import { useSelectedPropertyId } from './useSelectedPropertyId';

export function useV6IntegrationStatus(overridePropertyId?: string) {
  const selectedPropertyId = useSelectedPropertyId();
  const propertyId = overridePropertyId ?? selectedPropertyId;
  const { data: res, isLoading, isFetching } = useGetIntegrationsQuery(
    propertyId ? { propertyId } : undefined,
  );
  const { data: companyRes, isLoading: companyLoading } = useGetIntegrationsQuery(
    undefined,
    { skip: !propertyId },
  );
  const integrations = res?.data || [];
  const companyIntegrations = companyRes?.data || [];
  const v6Exact = integrations.find(
    (i: any) => i.integrationType === 'v6erp' && i.isActive !== false && i.status !== 'disabled',
  );
  const v6Any = companyIntegrations.find(
    (i: any) => i.integrationType === 'v6erp' && i.isActive !== false && i.status !== 'disabled',
  );
  const v6 = v6Exact || v6Any || integrations.find((i: any) => i.integrationType === 'v6erp');
  const isV6PushActive = Boolean(
    v6 && v6.isActive !== false && v6.status !== 'disabled'
  );

  return {
    isV6Active: isV6PushActive,
    isV6PushActive,
    v6Config: v6,
    isLoading: isLoading || isFetching || companyLoading,
  };
}
