import { useGetIntegrationsQuery } from '../store/api/integrationsApi';

export function useV6IntegrationStatus() {
  const { data: res, isLoading, isFetching } = useGetIntegrationsQuery();
  const integrations = res?.data || [];
  const v6 = integrations.find((i: any) => i.integrationType === 'v6erp');
  const isV6Active = Boolean(
    v6 && (v6.isActive || v6.status === 'active') && v6.status !== 'disabled'
  );

  return {
    isV6Active,
    v6Config: v6,
    isLoading: isLoading || isFetching,
  };
}
