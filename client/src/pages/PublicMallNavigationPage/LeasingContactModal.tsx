import { useEffect } from 'react';
import { X } from 'lucide-react';
import LeasingContactPanel, { type LeasingContact } from './LeasingContactPanel';
import type { EnquiryUnit } from './leasingContact';
import './AvailableUnitsAdModal.css';

interface Props {
  propertyId: string;
  contact?: LeasingContact | null;
  propertyName?: string;
  unit: EnquiryUnit;
  onClose: () => void;
}

/** "Interested in this unit?" sheet opened from the map card of an available unit. */
export default function LeasingContactModal({ propertyId, contact, propertyName, unit, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="public-ad-overlay" onClick={onClose}>
      <div
        className="public-ad-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Contact leasing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="public-ad-header">
          <h3 className="public-ad-title">Interested in this unit?</h3>
          <button type="button" className="public-ad-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="public-ad-text">Leave your details and our leasing team will get back to you.</p>
        <LeasingContactPanel propertyId={propertyId} contact={contact} propertyName={propertyName} unit={unit} />
        <div className="public-ad-actions">
          <button type="button" className="public-ad-btn is-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
