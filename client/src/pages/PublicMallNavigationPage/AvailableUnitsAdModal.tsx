import { useEffect, useMemo, useState } from 'react';
import { KeyRound, MapPin, Search, X } from 'lucide-react';
import LeasingContactPanel, { type LeasingContact } from './LeasingContactPanel';
import type { AvailableUnit } from './leasingContact';
import './AvailableUnitsAdModal.css';

interface Props {
  count: number;
  propertyId: string;
  propertyName?: string;
  contact?: LeasingContact | null;
  /** Units that can be listed with an "Enquire" button (sorted by floor / unit number). */
  units: AvailableUnit[];
  onViewUnits: () => void;
  /** Open the map on the floor of a listed unit with that unit selected. */
  onShowUnit: (unit: AvailableUnit) => void;
  onClose: () => void;
}

/** From this many units on, the list scrolls and gets a floor + unit-number filter. */
const FILTER_FROM = 5;

export default function AvailableUnitsAdModal({
  count,
  propertyId,
  propertyName,
  contact,
  units,
  onViewUnits,
  onShowUnit,
  onClose,
}: Props) {
  const [showContact, setShowContact] = useState(false);
  const [enquiryUnit, setEnquiryUnit] = useState<AvailableUnit | null>(null);
  const [floorFilter, setFloorFilter] = useState('');
  const [query, setQuery] = useState('');

  const showTools = units.length >= FILTER_FROM;
  const floors = useMemo(() => Array.from(new Set(units.map((u) => u.floor))), [units]);
  const visibleUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter((u) => (!floorFilter || u.floor === floorFilter) && (!q || u.unitNumber.toLowerCase().includes(q)));
  }, [units, floorFilter, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const enquire = (unit: AvailableUnit | null) => {
    setEnquiryUnit(unit);
    setShowContact(true);
  };

  return (
    <div className="public-ad-overlay" onClick={onClose}>
      <div
        className="public-ad-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Units available for lease"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="public-ad-header">
          <div className="public-ad-icon">
            <KeyRound size={20} />
          </div>
          <h3 className="public-ad-title">Looking for a space to rent?</h3>
          <button type="button" className="public-ad-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="public-ad-text">
          {propertyName ? `${propertyName} has ` : 'There are '}
          <strong>{count}</strong> {count === 1 ? 'unit' : 'units'} available for lease. Grow your business with us!
        </p>

        {showTools && (
          <div className="public-ad-filters">
            {floors.length > 1 && (
              <select
                className="public-ad-filter-select"
                value={floorFilter}
                onChange={(e) => setFloorFilter(e.target.value)}
                aria-label="Filter by floor"
              >
                <option value="">All floors</option>
                {floors.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            )}
            <label className="public-ad-filter-search">
              <Search size={14} />
              <input
                type="search"
                placeholder="Unit number"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search by unit number"
              />
            </label>
          </div>
        )}

        {units.length > 0 && (
          <ul className={`public-ad-units ${showTools ? 'is-scroll' : ''}`}>
            {visibleUnits.map((u) => (
              <li key={u.unitId} className={`public-ad-unit ${enquiryUnit?.unitId === u.unitId ? 'is-active' : ''}`}>
                <div className="public-ad-unit-info">
                  <strong>{u.unitNumber}</strong>
                  <span>
                    {u.floor}
                    {u.areaSqft ? ` · ${Math.round(u.areaSqft)} sqft` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="public-ad-unit-btn"
                  onClick={() => onShowUnit(u)}
                  title="Show on the map"
                  aria-label={`Show ${u.unitNumber} on the map`}
                >
                  <MapPin size={14} />
                </button>
                <button type="button" className="public-ad-unit-btn is-enquire" onClick={() => enquire(u)}>
                  Enquire
                </button>
              </li>
            ))}
            {visibleUnits.length === 0 && <li className="public-ad-units-empty">No units match your filter.</li>}
          </ul>
        )}
        {showTools && (
          <div className="public-ad-units-count">
            {visibleUnits.length === units.length
              ? `${units.length} units`
              : `${visibleUnits.length} of ${units.length} units`}
          </div>
        )}

        {showContact && (
          <LeasingContactPanel
            propertyId={propertyId}
            contact={contact}
            propertyName={propertyName}
            unit={enquiryUnit}
          />
        )}

        <div className="public-ad-actions">
          {!showContact && (
            <button type="button" className="public-ad-btn is-primary" onClick={() => enquire(null)}>
              I'm interested
            </button>
          )}
          <button
            type="button"
            className={`public-ad-btn ${!showContact ? '' : 'is-primary'}`}
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
