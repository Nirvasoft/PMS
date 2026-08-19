import { useState } from 'react';
import {
  useGetFloorSetupsQuery, useCreateFloorSetupMutation, useUpdateFloorSetupMutation, useDeleteFloorSetupMutation,
  useGetPropertiesQuery, type FloorSetup,
} from '../../../store/api/propertiesApi';
import { Layers, Plus, X, Pencil, Trash2, Search } from 'lucide-react';
import { useAlertDialog, useConfirm } from '../../../components/DialogProvider';
import '../BillingPage/BillingPage.css';

// Unicode superscript letters — native <option> text can't render <sup> HTML, so the
// suffix is composed from real superscript characters instead (1ˢᵗ, 2ⁿᵈ, 3ʳᵈ, 4ᵗʰ...).
const SUPERSCRIPT: Record<string, string> = { s: 'ˢ', t: 'ᵗ', n: 'ⁿ', d: 'ᵈ', r: 'ʳ', h: 'ʰ' };
const toSuperscript = (s: string) => s.split('').map((c) => SUPERSCRIPT[c] || c).join('');

/** 1 -> "1ˢᵗ Floor", 2 -> "2ⁿᵈ Floor", 3 -> "3ʳᵈ Floor", 4 -> "4ᵗʰ Floor", 11-13 -> "ᵗʰ" */
function ordinalFloorLabel(n: number): string {
  const j = n % 10;
  const k = n % 100;
  let suffix: string;
  if (j === 1 && k !== 11) suffix = 'st';
  else if (j === 2 && k !== 12) suffix = 'nd';
  else if (j === 3 && k !== 13) suffix = 'rd';
  else suffix = 'th';
  return `${n}${toSuperscript(suffix)} Floor`;
}

export default function FloorSetupPage() {
  const { data: propertiesData } = useGetPropertiesQuery({ limit: 100 });
  const properties = propertiesData?.data || [];

  const floorNumberOptions = (propertyId: string) => {
    const totalFloors = properties.find((p) => p.id === propertyId)?.totalFloors || 0;
    return Array.from({ length: totalFloors }, (_, i) => i + 1);
  };

  // Search filters — only applied to the query when "Search" is clicked
  const [searchPropertyId, setSearchPropertyId] = useState('');
  const [searchFloorNumber, setSearchFloorNumber] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{ propertyId?: string; floorNumber?: number }>({});

  const { data: floorsData, isFetching } = useGetFloorSetupsQuery(appliedFilters);
  const [createFloorSetup, { isLoading: creating }] = useCreateFloorSetupMutation();
  const [updateFloorSetup, { isLoading: updating }] = useUpdateFloorSetupMutation();
  const [deleteFloorSetup] = useDeleteFloorSetupMutation();
  const alertDialog = useAlertDialog();
  const confirmDialog = useConfirm();

  const floors = floorsData?.data || [];

  const emptyForm = { propertyId: '', floorNumber: '', floorLabel: '' };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FloorSetup | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (f: FloorSetup) => {
    setEditing(f);
    setForm({ propertyId: f.propertyId, floorNumber: String(f.floorNumber), floorLabel: f.floorLabel });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSearch = () => {
    setAppliedFilters({
      propertyId: searchPropertyId || undefined,
      floorNumber: searchFloorNumber ? Number(searchFloorNumber) : undefined,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      propertyId: form.propertyId,
      floorNumber: Number(form.floorNumber),
      floorLabel: form.floorLabel.trim(),
    };
    try {
      if (editing) {
        await updateFloorSetup({ id: editing.id, data: payload }).unwrap();
      } else {
        await createFloorSetup(payload).unwrap();
      }
      closeForm();
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || err?.data?.message || `Failed to ${editing ? 'update' : 'create'} floor`);
    }
  };

  const handleDelete = async (f: FloorSetup) => {
    if (!(await confirmDialog(`Delete floor "${f.floorLabel}"?`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteFloorSetup(f.id).unwrap();
    } catch {
      alertDialog('Failed to delete floor');
    }
  };

  const formTotalFloors = properties.find((p) => p.id === form.propertyId)?.totalFloors || 0;

  return (
    <div className="billing-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
            <Layers size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Floor Setup</h1>
            <p>Define standard floor numbers and labels for each property</p>
          </div>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Floor
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="billing-table-wrap" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="inv-field" style={{ minWidth: 220 }}>
          <label>Property</label>
          <select value={searchPropertyId} onChange={(e) => { setSearchPropertyId(e.target.value); setSearchFloorNumber(''); }}>
            <option value="">All Properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="inv-field" style={{ minWidth: 160 }}>
          <label>Floor Number</label>
          <select value={searchFloorNumber} onChange={(e) => setSearchFloorNumber(e.target.value)} disabled={!searchPropertyId}>
            <option value="">All Floors</option>
            {floorNumberOptions(searchPropertyId).map((n) => <option key={n} value={n}>{ordinalFloorLabel(n)}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} /> Search
        </button>
      </div>

      {/* Floor Setup Table */}
      <div className="billing-table-wrap">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Property Name</th>
              <th>Floor Number</th>
              <th>Floor Label</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && floors.length === 0 ? (
              <tr><td colSpan={4} className="billing-empty">Loading…</td></tr>
            ) : floors.length === 0 ? (
              <tr><td colSpan={4} className="billing-empty">No floors set up yet</td></tr>
            ) : floors.map((f) => (
              <tr key={f.id}>
                <td><span className="cell-primary">{f.property.name}</span></td>
                <td><span className="cell-mono">{ordinalFloorLabel(f.floorNumber)}</span></td>
                <td>{f.floorLabel}</td>
                <td className="text-center">
                  <button className="btn-icon" title="Edit" onClick={() => openEdit(f)}>
                    <Pencil size={14} />
                  </button>
                  <button className=" btn-danger" title="Delete" onClick={() => handleDelete(f)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Layers size={18} /> {editing ? 'Edit Floor' : 'New Floor'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="inv-form-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>
                  <div className="inv-field">
                    <label>Property <span className="req">*</span></label>
                    <select required value={form.propertyId}
                      onChange={(e) => setForm({ ...form, propertyId: e.target.value, floorNumber: '' })}>
                      <option value="">Select property…</option>
                      {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Floor Number <span className="req">*</span></label>
                    <select required value={form.floorNumber} disabled={!form.propertyId}
                      onChange={(e) => setForm({ ...form, floorNumber: e.target.value })}>
                      <option value="">
                        {!form.propertyId ? 'Select a property first…' : formTotalFloors === 0 ? 'No total floors set for this property' : 'Select floor…'}
                      </option>
                      {floorNumberOptions(form.propertyId).map((n) => <option key={n} value={n}>{ordinalFloorLabel(n)}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label>Floor Label <span className="req">*</span></label>
                    <input required placeholder="e.g. 10th Floor" value={form.floorLabel}
                      onChange={(e) => setForm({ ...form, floorLabel: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating || updating}>
                  {creating || updating ? 'Saving…' : editing ? 'Save Changes' : 'Create Floor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
