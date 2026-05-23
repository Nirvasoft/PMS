import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { setSelectedProperty } from '../store/slices/propertiesSlice';
import { useGetPropertiesQuery } from '../store/api/propertiesApi';

/**
 * Returns the currently selected propertyId.
 * Auto-selects the first property if none is selected.
 */
export function useSelectedPropertyId(): string {
  const dispatch = useAppDispatch();
  const selectedPropertyId = useAppSelector((s) => s.properties.selectedPropertyId);
  const { data: propertiesRes } = useGetPropertiesQuery({ limit: 100 });
  const properties = propertiesRes?.data || [];

  useEffect(() => {
    if (!selectedPropertyId && properties.length > 0) {
      dispatch(setSelectedProperty(properties[0].id));
    }
  }, [selectedPropertyId, properties, dispatch]);

  return selectedPropertyId || properties[0]?.id || '';
}
