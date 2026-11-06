import { useEffect, useState } from 'react';
import { KeyRound, X, Phone, Mail } from 'lucide-react';
import './AvailableUnitsAdModal.css';

export interface LeasingContact {
  name?: string | null;
  phones?: string[] | null;
  email?: string | null;
}

interface Props {
  count: number;
  propertyName?: string;
  contact?: LeasingContact | null;
  onViewUnits: () => void;
  onClose: () => void;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export default function AvailableUnitsAdModal({ count, propertyName, contact, onViewUnits, onClose }: Props) {
  const [showContact, setShowContact] = useState(false);
  const phones = contact?.phones?.filter(Boolean) ?? [];
  const hasContact = Boolean(contact && (phones.length > 0 || contact.email));

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
        aria-label="Units available for lease"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="public-ad-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="public-ad-icon">
          <KeyRound size={26} />
        </div>
        <h3 className="public-ad-title">Looking for a space to rent?</h3>
        <p className="public-ad-text">
          {propertyName ? `${propertyName} has ` : 'There are '}
          <strong>{count}</strong> {count === 1 ? 'unit' : 'units'} available for lease. Grow your business with us!
        </p>

        {showContact && contact && (
          <div className="public-ad-contact">
            {contact.name && <div className="public-ad-contact-name">{contact.name}</div>}
            {phones.map((p) => (
              <a key={p} className="public-ad-contact-link" href={telHref(p)}>
                <Phone size={15} /> Call {p}
              </a>
            ))}
            {contact.email && (
              <a className="public-ad-contact-link" href={`mailto:${contact.email}`}>
                <Mail size={15} /> {contact.email}
              </a>
            )}
          </div>
        )}

        <div className="public-ad-actions">
          {hasContact && !showContact && (
            <button type="button" className="public-ad-btn is-primary" onClick={() => setShowContact(true)}>
              I'm interested
            </button>
          )}
          <button
            type="button"
            className={`public-ad-btn ${hasContact && !showContact ? '' : 'is-primary'}`}
            onClick={onViewUnits}
          >
            View available units
          </button>
          <button type="button" className="public-ad-btn is-ghost" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
