import type { RentalAgreement } from '../../../../../../store/api/leasesApi';
import type { FormState } from '../../types';

export function RentalAgreementStep({ form, set }: { form: FormState; set: Function }) {
  const ra = form.rentalAgreement;
  const setRA = (key: keyof RentalAgreement, val: string) =>
    set('rentalAgreement', { ...ra, [key]: val });

  return (
    <div className="step-content">
      <h3>Rental Agreement Information</h3>

      <div className="ra-grid">
        {/* ── Renter (left) ── */}
        <div className="ra-col">
          <RAField label="Renter Name" required>
            <input value={ra.renterName || ''} onChange={(e) => setRA('renterName', e.target.value)} />
          </RAField>
          <RAField label="Address (Renter)">
            <textarea rows={3} value={ra.renterAddress || ''} onChange={(e) => setRA('renterAddress', e.target.value)} />
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
            <textarea rows={3} value={ra.customerAddress || ''} onChange={(e) => setRA('customerAddress', e.target.value)} />
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
