import { useState, useEffect } from 'react';
import {
  useGetAccessCardsQuery, useGetAccessCardStatsQuery,
  useIssueAccessCardMutation, useUpdateAccessCardMutation,
  type AccessCard,
} from '../../../store/api/portalApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import {
  CreditCard, Search, Plus, ShieldCheck, ShieldOff, ShieldAlert,
  Tag, User, Building2, AlertTriangle, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUSES = ['', 'active', 'suspended', 'cancelled', 'lost'];
const CARD_TYPES = ['', 'rfid', 'nfc', 'qr', 'barcode'];

export default function AccessCardsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [editCard, setEditCard] = useState<AccessCard | null>(null);

  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const properties = propertiesData?.data || [];

  const { data, isLoading } = useGetAccessCardsQuery({
    propertyId: propertyFilter || undefined,
    status: statusFilter || undefined,
    cardType: typeFilter || undefined,
    search: search || undefined,
    page,
  });
  const { data: stats } = useGetAccessCardStatsQuery();

  const [issueCard] = useIssueAccessCardMutation();
  const [updateCard] = useUpdateAccessCardMutation();

  const items = data?.data || [];
  const meta = data?.meta;

  const statusColor = (s: string) => {
    switch (s) {
      case 'active': return 'status-active';
      case 'suspended': return 'status-pending';
      case 'cancelled': return 'status-cancelled';
      case 'lost': return 'status-overdue';
      default: return '';
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'active': return <ShieldCheck size={14} />;
      case 'suspended': return <ShieldOff size={14} />;
      case 'cancelled': return <X size={14} />;
      case 'lost': return <ShieldAlert size={14} />;
      default: return <CreditCard size={14} />;
    }
  };

  const cardTypeLabel = (t: string) => {
    return t.toUpperCase();
  };

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1><CreditCard size={24} /> Resident Access Cards</h1>
          <p className="text-muted">Manage access cards, fobs, and NFC tags for residents</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowIssueForm(true)}>
          <Plus size={14} /> Issue Card
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div className="info-card" style={{ padding: '14px 16px', borderTop: '3px solid var(--primary, #6366f1)' }}>
            <div style={{ fontSize: '0.78rem', opacity: 0.6 }}>Total Cards</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</div>
          </div>
          {stats.byStatus.map(s => (
            <div key={s.status} className="info-card" style={{
              padding: '14px 16px',
              borderTop: `3px solid ${s.status === 'active' ? '#22c55e' : s.status === 'suspended' ? '#f59e0b' : s.status === 'lost' ? '#ef4444' : '#94a3b8'}`,
            }}>
              <div style={{ fontSize: '0.78rem', opacity: 0.6, textTransform: 'capitalize' }}>{s.status}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.count}</div>
            </div>
          ))}
          {stats.expiringSoon > 0 && (
            <div className="info-card" style={{ padding: '14px 16px', borderTop: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '0.78rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={12} /> Expiring Soon
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{stats.expiringSoon}</div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="section-toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: 200 }}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Search card number or resident name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select value={propertyFilter} onChange={(e) => { setPropertyFilter(e.target.value); setPage(1); }} className="form-select" style={{ width: 170 }}>
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="form-select" style={{ width: 130 }}>
          {STATUSES.map(s => <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Status'}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="form-select" style={{ width: 120 }}>
          {CARD_TYPES.map(t => <option key={t} value={t}>{t ? t.toUpperCase() : 'All Types'}</option>)}
        </select>
      </div>

      {/* Issue Form Modal */}
      {showIssueForm && (
        <IssueCardModal
          properties={properties}
          onClose={() => setShowIssueForm(false)}
          onSubmit={async (formData) => {
            try {
              await issueCard(formData).unwrap();
              toast.success('Access card issued successfully');
              setShowIssueForm(false);
            } catch (e: any) {
              toast.error(e?.data?.errors?.[0]?.message || 'Failed to issue card');
            }
          }}
        />
      )}

      {/* Edit Card Modal */}
      {editCard && (
        <EditCardModal
          card={editCard}
          onClose={() => setEditCard(null)}
          onSave={async (updates) => {
            try {
              await updateCard({ id: editCard.id, ...updates }).unwrap();
              toast.success('Card updated');
              setEditCard(null);
            } catch { toast.error('Failed to update card'); }
          }}
        />
      )}

      {/* Table */}
      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading cards...</div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" id="access-cards-table">
            <thead>
              <tr>
                <th>Card Number</th>
                <th>Type</th>
                <th>Resident</th>
                <th>Property</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, opacity: 0.5 }}>No access cards found</td></tr>
              ) : items.map(card => (
                <tr key={card.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CreditCard size={14} style={{ opacity: 0.4 }} />
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{card.cardNumber}</span>
                    </div>
                  </td>
                  <td>
                    <span className="status-badge" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontSize: '0.7rem' }}>
                      <Tag size={10} /> {cardTypeLabel(card.cardType)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <User size={12} style={{ opacity: 0.4 }} />
                      {card.resident ? `${card.resident.firstName} ${card.resident.lastName}` : '—'}
                    </div>
                    {card.resident?.residentType && (
                      <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{card.resident.residentType}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Building2 size={12} style={{ opacity: 0.4 }} />
                      {card.property?.name || '—'}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {new Date(card.issuedAt).toLocaleDateString()}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {card.expiresAt ? (
                      <span style={{ color: new Date(card.expiresAt) < new Date() ? 'var(--danger, #ef4444)' : undefined }}>
                        {new Date(card.expiresAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.4 }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${statusColor(card.status)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {statusIcon(card.status)} {card.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setEditCard(card)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.total > meta.limit && (
        <div className="pagination" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="text-muted" style={{ padding: '6px 12px' }}>
            Page {meta.page} of {Math.ceil(meta.total / meta.limit)}
          </span>
          <button className="btn btn-sm" disabled={page >= Math.ceil(meta.total / meta.limit)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

// ── Issue Card Modal ───────────────────────────
function IssueCardModal({ properties, onClose, onSubmit }: {
  properties: any[];
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [form, setForm] = useState({
    residentId: '', propertyId: '', cardNumber: '',
    cardType: 'rfid', expiresAt: '', notes: '',
  });
  const [residentSearch, setResidentSearch] = useState('');

  // Fetch residents for selected property
  const { data: residentsData } = useGetResidentsForProperty(form.propertyId);
  const residents = residentsData || [];

  const filteredResidents = residents.filter((r: any) =>
    !residentSearch || `${r.firstName} ${r.lastName}`.toLowerCase().includes(residentSearch.toLowerCase())
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={20} /> Issue New Access Card
        </h3>

        <div className="form-group">
          <label>Property *</label>
          <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value, residentId: '' })} className="form-select">
            <option value="">Select property...</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {form.propertyId && (
          <div className="form-group">
            <label>Resident *</label>
            <input
              type="text"
              placeholder="Search resident..."
              value={residentSearch}
              onChange={(e) => setResidentSearch(e.target.value)}
              style={{ marginBottom: 4 }}
            />
            <select value={form.residentId} onChange={(e) => setForm({ ...form, residentId: e.target.value })} className="form-select">
              <option value="">Select resident...</option>
              {filteredResidents.map((r: any) => (
                <option key={r.id} value={r.id}>{r.firstName} {r.lastName} ({r.residentType})</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Card Number *</label>
            <input type="text" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} placeholder="e.g. RF-00123" />
          </div>
          <div className="form-group">
            <label>Card Type</label>
            <select value={form.cardType} onChange={(e) => setForm({ ...form, cardType: e.target.value })} className="form-select">
              <option value="rfid">RFID</option>
              <option value="nfc">NFC</option>
              <option value="qr">QR Code</option>
              <option value="barcode">Barcode</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Expiry Date</label>
          <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes..." />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!form.residentId || !form.propertyId || !form.cardNumber}
            onClick={() => onSubmit({
              residentId: form.residentId,
              propertyId: form.propertyId,
              cardNumber: form.cardNumber,
              cardType: form.cardType,
              expiresAt: form.expiresAt || undefined,
              notes: form.notes || undefined,
            })}
          >
            Issue Card
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Card Modal ────────────────────────────
function EditCardModal({ card, onClose, onSave }: {
  card: AccessCard;
  onClose: () => void;
  onSave: (updates: { status?: string; notes?: string; expiresAt?: string }) => void;
}) {
  const [status, setStatus] = useState(card.status);
  const [notes, setNotes] = useState(card.notes || '');
  const [expiresAt, setExpiresAt] = useState(card.expiresAt ? card.expiresAt.split('T')[0] : '');

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3>Edit Card — {card.cardNumber}</h3>
        <p className="text-muted" style={{ fontSize: '0.82rem' }}>
          {card.resident ? `${card.resident.firstName} ${card.resident.lastName}` : ''} · {card.property?.name || ''}
        </p>

        <div className="form-group">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-select">
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
            <option value="lost">Lost</option>
          </select>
        </div>

        <div className="form-group">
          <label>Expiry Date</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({
            status: status !== card.status ? status : undefined,
            notes: notes !== (card.notes || '') ? notes : undefined,
            expiresAt: expiresAt !== (card.expiresAt?.split('T')[0] || '') ? (expiresAt || undefined) : undefined,
          })}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Residents loader hook ──────────────────────
function useGetResidentsForProperty(propertyId: string) {
  const [residents, setResidents] = useState<any[]>([]);

  useEffect(() => {
    if (!propertyId) { setResidents([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('accessToken') || '';
        const res = await fetch(`/api/v1/residents?propertyId=${propertyId}&limit=200`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'XMLHttpRequest' },
        });
        const json = await res.json();
        if (!cancelled) setResidents(json.data || []);
      } catch { if (!cancelled) setResidents([]); }
    })();
    return () => { cancelled = true; };
  }, [propertyId]);

  return { data: residents };
}
