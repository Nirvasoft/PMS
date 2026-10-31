import { useMemo, useState } from 'react';
import { useGetTenantsQuery } from '../store/api/tenantsApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import ComboBox from './ComboBox';

interface Props {
  id?: string;
  value: string;
  selectedLabel: string;
  onChange: (id: string, label: string) => void;
  /** Limit the list to tenants of this property. */
  propertyId?: string;
  /** Hide this tenant from the list (e.g. the other side of a merge). */
  excludeId?: string;
  placeholder?: string;
  /** Highlights the control in red (validation error). */
  invalid?: boolean;
}

/**
 * Tenant ComboBox with server-side search, matching the Tenant ID picker
 * used by the Lease form (label = name, sublabel = company / last name).
 */
export default function TenantComboBox({
  id, value, selectedLabel, onChange, propertyId, excludeId,
  placeholder = 'Search id or name', invalid = false,
}: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const { data, isFetching } = useGetTenantsQuery({
    search: debouncedSearch || undefined,
    propertyId,
    limit: 20,
  });

  const options = useMemo(() => {
    const list = (data?.data || [])
      .filter((t) => t.id !== excludeId)
      .map((t) => {
        const isCompany = t.tenantType === 'company' || t.tenantType === 'corporate';
        if (isCompany) {
          return {
            id: t.id,
            label: t.firstName || t.companyName || t.displayName,
            sublabel: t.firstName ? (t.companyName || t.lastName || undefined) : (t.lastName || undefined),
          };
        }
        return {
          id: t.id,
          label: t.firstName || t.lastName || t.displayName,
          sublabel: t.firstName ? (t.lastName || undefined) : undefined,
        };
      });

    // Keep the current selection visible even when a search no longer returns it.
    if (value && value !== excludeId && !list.some((t) => t.id === value)) {
      list.unshift({ id: value, label: selectedLabel || 'Selected tenant', sublabel: undefined });
    }
    return list;
  }, [data?.data, excludeId, value, selectedLabel]);

  return (
    <div className={invalid ? 'combobox-invalid' : undefined}>
      <ComboBox
        id={id}
        value={value}
        selectedLabel={selectedLabel}
        onChange={(nextId) => {
          const opt = options.find((t) => t.id === nextId);
          onChange(nextId, opt?.label || '');
        }}
        options={options}
        onSearch={setSearch}
        loading={isFetching}
        placeholder={placeholder}
        emptyText={propertyId ? 'No tenants found for this property' : 'No tenants found'}
      />
    </div>
  );
}
