import { useMemo } from 'react';
import ComboBox, { type ComboBoxOption } from '../../../../../../components/ComboBox';
import { useGetUsersQuery } from '../../../../../../store/api/usersApi';
import type { RentalAgreement } from '../../../../../../store/api/leasesApi';
import type { FormState } from '../../types';

export function RentalAgreementStep({ form, set }: { form: FormState; set: Function }) {
  const ra = form.rentalAgreement;
  const setRA = (key: keyof RentalAgreement, val: string) =>
    set('rentalAgreement', { ...ra, [key]: val });

  const { data: usersData, isFetching: usersLoading } = useGetUsersQuery({ limit: '200', isActive: 'true' });
  const users = usersData?.data || [];

  const userOptions: ComboBoxOption[] = useMemo(() => {
    return users.map((u) => ({
      id: u.fullName,
      label: u.fullName,
      sublabel: [u.jobTitle, u.email].filter(Boolean).join(' · ') || undefined,
    }));
  }, [users]);

  return (
    <div className="step-content">
      <h3>Rental Agreement Information</h3>

      <div className="ra-grid">
        {/* ── Renter (left) ── */}
        <div className="ra-col">
          <RAField label="Renter Name" required>
            <ComboBox
              id="ra-renter-name"
              value={ra.renterName || ''}
              options={userOptions}
              loading={usersLoading}
              allowCustom
              placeholder="Select user or type name…"
              emptyText="No users found"
              onChange={(val) => setRA('renterName', val)}
              onSelectOption={(opt) => {
                set('rentalAgreement', {
                  ...ra,
                  renterName: opt.label,
                  renterSignedName: opt.label,
                });
              }}
            />
          </RAField>
          <RAField label="Address (Renter)">
            <textarea rows={2} value={ra.renterAddress || ''} onChange={(e) => setRA('renterAddress', e.target.value)} />
          </RAField>
          <RAField label="Signed Name (Renter)" required>
            <input value={ra.renterSignedName || ''} onChange={(e) => setRA('renterSignedName', e.target.value)} />
          </RAField>
          <RAField label="NRC (Renter)" required>
            <input value={ra.renterNirc || ''} onChange={(e) => setRA('renterNirc', e.target.value)} />
          </RAField>
          <RAField label="Date (Renter)" required>
            <input type="date" value={ra.renterDate || ''} onChange={(e) => setRA('renterDate', e.target.value)} />
          </RAField>
        </div>

        {/* ── Customer (right) ── */}
        <div className="ra-col">
          <RAField label="Company Name" required>
            <input value={ra.companyName || ''} onChange={(e) => setRA('companyName', e.target.value)} />
          </RAField>
          <RAField label="Address (Customer)">
            <textarea rows={2} value={ra.customerAddress || ''} onChange={(e) => setRA('customerAddress', e.target.value)} />
          </RAField>
          <RAField label="Signed Name (Customer)" required>
            <input value={ra.customerSignedName || ''} onChange={(e) => setRA('customerSignedName', e.target.value)} />
          </RAField>
          <RAField label="NRC (Customer)" required>
            <input value={ra.customerNirc || ''} onChange={(e) => setRA('customerNirc', e.target.value)} />
          </RAField>
          <RAField label="Date (Customer)" required>
            <input type="date" value={ra.customerDate || ''} onChange={(e) => setRA('customerDate', e.target.value)} />
          </RAField>
        </div>
      </div>
    </div>
  );
}

function RAField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="ra-field">
      <label>{required && <span className="ra-req">*</span>}{label}</label>
      {children}
    </div>
  );
}
