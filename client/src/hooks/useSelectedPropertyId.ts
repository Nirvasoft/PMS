import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { setSelectedProperty } from '../store/slices/propertiesSlice';
import { useGetMyPropertyScopeQuery } from '../store/api/propertiesApi';

/**
 * Returns the currently selected propertyId.
 * Auto-selects the first property if none is selected.
 *
 * Uses the scope-only /properties/my-scope endpoint (not gated by properties.read) so this
 * stays correct for property-scoped users who lack admin access to the Properties module.
 */
export function useSelectedPropertyId(): string {
  const dispatch = useAppDispatch();
  const selectedPropertyId = useAppSelector((s) => s.properties.selectedPropertyId);
  const { data: propertiesRes } = useGetMyPropertyScopeQuery();
  const properties = propertiesRes?.data || [];

  useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) {
      dispatch(setSelectedProperty(properties[0].id));
    }
  }, [selectedPropertyId, properties, dispatch]);

  return selectedPropertyId || properties[0]?.id || '';
}
