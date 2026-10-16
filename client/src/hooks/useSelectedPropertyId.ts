import { useEffect } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
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
 * Like useSelectedPropertyId(), but returns '' when the user is on the Dashboard (/dashboard)
 * or Properties list (/admin/properties) and has explicitly picked "All Properties" in the sidebar.
 * On all other pages, "All Properties" is hidden from the Active Property dropdown and falls back
 * to the first property.
 */
export function useSelectedPropertyFilter(): string {
  const location = useLocation();
  const supportsAllProperties =
    !!matchPath('/dashboard', location.pathname) ||
    !!matchPath('/admin/properties', location.pathname);
  const rawSelected = useAppSelector((s) => s.properties.selectedPropertyId);
  const fallbackId = useSelectedPropertyId();
  return supportsAllProperties && rawSelected === ALL_PROPERTIES ? '' : fallbackId;
}
