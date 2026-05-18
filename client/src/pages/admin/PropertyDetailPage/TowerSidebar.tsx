import { Building2, ChevronRight, Plus, Settings2 } from 'lucide-react';
import type { Tower } from '../../../store/api/unitsApi';

interface TowerSidebarProps {
  propertyId: string;
  towers: Tower[];
  selectedTowerId: string | null;
  onSelect: (id: string | null) => void;
}

const STATUS_COLORS: Record<string, string> = {
  available: '#2ecc71', occupied: '#2196F3', reserved: '#FF9800',
  maintenance: '#F44336', not_for_rent: '#9E9E9E',
};

export function TowerSidebar({ towers, selectedTowerId, onSelect }: TowerSidebarProps) {
  return (
    <div className="tower-sidebar">
      <div className="tower-sidebar-header">
        <span className="tower-sidebar-title">Towers / Blocks</span>
      </div>

      <button className={`tower-item ${!selectedTowerId ? 'active' : ''}`} onClick={() => onSelect(null)}>
        <Building2 size={14} />
        <span>All</span>
      </button>

      {towers.map((tower) => {
        const stats = tower.unitStats;
        return (
          <div key={tower.id}>
            <button
              className={`tower-item ${selectedTowerId === tower.id ? 'active' : ''}`}
              onClick={() => onSelect(tower.id)}
            >
              <Building2 size={14} />
              <div className="tower-item-info">
                <span className="tower-item-name">{tower.name}</span>
                {tower.code && <span className="tower-item-code">{tower.code}</span>}
              </div>
              {stats && (
                <div className="tower-mini-bar">
                  {stats.available > 0 && <div style={{ flex: stats.available, background: STATUS_COLORS.available }} />}
                  {stats.occupied > 0 && <div style={{ flex: stats.occupied, background: STATUS_COLORS.occupied }} />}
                  {stats.reserved > 0 && <div style={{ flex: stats.reserved, background: STATUS_COLORS.reserved }} />}
                  {stats.maintenance > 0 && <div style={{ flex: stats.maintenance, background: STATUS_COLORS.maintenance }} />}
                </div>
              )}
            </button>
            {selectedTowerId === tower.id && tower.sections.length > 0 && (
              <div className="tower-sections">
                {tower.sections.map((s) => (
                  <div key={s.id} className="section-item"><ChevronRight size={10} />{s.name}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
