import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { setSelectedProperty } from '../store/slices/propertiesSlice';
import { useGetMyPropertyScopeQuery } from '../store/api/propertiesApi';

/** Sentinel stored in Redux when the user explicitly picks "All Properties" in the sidebar. */
export const ALL_PROPERTIES = '__all__';

/**
 * Returns the currently selected propertyId.
 * Auto-selects the first property if none is selected.
 *
 * Uses the scope-only /properties/my-scope endpoint (not gated by properties.read) so this
 * stays correct for property-scoped users who lack admin access to the Properties module.
 *
 * Treats an explicit "All Properties" choice the same as unset (falls back to the first
 * property) — pages that need to support "All" as a real, unfiltered state should use
 * useSelectedPropertyFilter() instead.
 */
export function useSelectedPropertyId(): string {
  const dispatch = useAppDispatch();
  const rawSelected = useAppSelector((s) => s.properties.selectedPropertyId);
  const selectedPropertyId = rawSelected === ALL_PROPERTIES ? null : rawSelected;
  const { data: propertiesRes } = useGetMyPropertyScopeQuery();
  const properties = propertiesRes?.data || [];

  useEffect(() => {
    // Only auto-select when nothing has ever been chosen — an explicit "All Properties"
    // choice (rawSelected === ALL_PROPERTIES) must not be silently overwritten back to
    // a specific property.
    if (rawSelected === null && properties.length > 0) {
      dispatch(setSelectedProperty(properties[0].id));
    }
  }, [rawSelected, properties, dispatch]);

  return selectedPropertyId || properties[0]?.id || '';
}

/**
 * Like useSelectedPropertyId(), but returns '' when the user has explicitly picked
 * "All Properties" in the sidebar — for filter pages that should show unfiltered,
 * all-properties data in that case instead of falling back to the first property.
 */
export function useSelectedPropertyFilter(): string {
  const rawSelected = useAppSelector((s) => s.properties.selectedPropertyId);
  const fallbackId = useSelectedPropertyId();
  return rawSelected === ALL_PROPERTIES ? '' : fallbackId;
}
