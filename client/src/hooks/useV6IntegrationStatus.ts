import { useGetIntegrationsQuery } from '../store/api/integrationsApi';
import { useSelectedPropertyId } from './useSelectedPropertyId';

export function useV6IntegrationStatus(overridePropertyId?: string) {
  const selectedPropertyId = useSelectedPropertyId();
  const propertyId = overridePropertyId ?? selectedPropertyId;
  const { data: res, isLoading, isFetching } = useGetIntegrationsQuery(
    propertyId ? { propertyId } : undefined,
    { skip: !propertyId },
  );
  const integrations = res?.data || [];
  const v6 = integrations.find((i: any) => i.integrationType === 'v6erp');
  const isV6Active = Boolean(
    v6 && v6.isActive !== false && v6.status !== 'disabled'
  );

  return {
    isV6Active,
    v6Config: v6,
    isLoading: isLoading || isFetching,
  };
}
