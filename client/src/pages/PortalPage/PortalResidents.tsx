import { useState } from 'react';
import {
  useGetPortalResidentsQuery,
  useAddPortalResidentMutation,
  useUpdatePortalResidentMutation,
  useRemovePortalResidentMutation,
  useInviteResidentToPortalMutation,
  useGetPortalDashboardQuery,
} from '../../store/api/portalApi';
import type { PortalResidentFull } from '../../store/api/portalApi';
import toast from 'react-hot-toast';
import {
  Users, Plus, X, User, Edit2, Trash2, ShieldCheck, Car, Phone, Mail, Calendar, Send,
} from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  primary_tenant: 'Primary Tenant',
  family_member: 'Family Member',
  occupant: 'Occupant',
  domestic_helper: 'Domestic Helper',
};

const REL_LABELS: Record<string, string> = {
  spouse: 'Spouse',
  child: 'Child',
  parent: 'Parent',
  sibling: 'Sibling',
  employee: 'Employee',
};

export default function PortalResidents() {
  const { data: residents, isLoading } = useGetPortalResidentsQuery();
  const { data: dashboard } = useGetPortalDashboardQuery();
  const [addResident, { isLoading: adding }] = useAddPortalResidentMutation();
  const [updateResident] = useUpdatePortalResidentMutation();
  const [removeResident] = useRemovePortalResidentMutation();
  const [inviteResident, { isLoading: inviting }] = useInviteResidentToPortalMutation();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', residentType: 'family_member',
    relationship: '', mobile: '', email: '', vehiclePlate: '',
    dateOfBirth: '', moveInDate: '', notes: '',
  });

  const isPrimaryTenant = dashboard?.resident?.residentType === 'primary_tenant';

  const resetForm = () => {
    setForm({
      firstName: '', lastName: '', residentType: 'family_member',
      relationship: '', mobile: '', email: '', vehiclePlate: '',
      dateOfBirth: '', moveInDate: '', notes: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (r: PortalResidentFull) => {
    setForm({
      firstName: r.firstName, lastName: r.lastName,
      residentType: r.residentType,
      relationship: r.relationship || '',
      mobile: r.mobile || '', email: r.email || '',
      vehiclePlate: r.vehiclePlate || '',
      dateOfBirth: r.dateOfBirth?.split('T')[0] || '',
      moveInDate: r.moveInDate?.split('T')[0] || '',
      notes: r.notes || '',
    });
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      relationship: form.relationship || undefined,
      mobile: form.mobile || undefined,
      email: form.email || undefined,
      vehiclePlate: form.vehiclePlate || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      moveInDate: form.moveInDate || undefined,
      notes: form.notes || undefined,
    };

    try {
      if (editingId) {
        await updateResident({ id: editingId, ...payload }).unwrap();
        toast.success('Resident updated');
      } else {
        await addResident(payload).unwrap();
        toast.success('Resident added');
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to save resident');
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from your unit?`)) return;
    try {
      await removeResident(id).unwrap();
      toast.success('Resident removed');
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to remove resident');
    }
  };

  const handleInvite = async (residentId: string, residentName: string, existingEmail?: string | null) => {
    const email = window.prompt(
      `Enter email address to invite ${residentName} to the portal:`,
      existingEmail || '',
    );
    if (!email) return;

    try {
      const result = await inviteResident({ residentId, email }).unwrap();
      toast.success(
        `Invitation sent to ${result.email}! The link expires in 72 hours.`,
        { duration: 6000 },
      );
    } catch (err: any) {
      toast.error(err?.data?.errors?.[0]?.message || 'Failed to send invitation');
    }
  };

  return (
    <div className="page-content portal-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Residents</h1>
        {isPrimaryTenant && !showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)} id="portal-add-resident-btn">
            <Plus size={16} /> Add Resident
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="portal-card" style={{ marginBottom: 24 }} id="portal-resident-form">
          <div className="portal-card-header">
            <Users size={18} />
            <h3>{editingId ? 'Edit Resident' : 'Add Resident'}</h3>
            <button className="btn-icon" onClick={resetForm}><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="portal-form">
            <div className="portal-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>First Name *</label>
                <input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Last Name *</label>
                <input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} required />
              </div>
            </div>
            <div className="portal-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Type</label>
                <select value={form.residentType} onChange={e => setForm({ ...form, residentType: e.target.value })}>
                  <option value="family_member">Family Member</option>
                  <option value="occupant">Occupant</option>
                  <option value="domestic_helper">Domestic Helper</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Relationship</label>
                <select value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })}>
                  <option value="">— Select —</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="parent">Parent</option>
                  <option value="sibling">Sibling</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
            </div>
            <div className="portal-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Mobile</label>
                <input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="+65-9xxx-xxxx" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="portal-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Vehicle Plate</label>
                <input value={form.vehiclePlate} onChange={e => setForm({ ...form, vehiclePlate: e.target.value })} placeholder="SGX1234A" />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="portal-form-actions">
              <button type="button" className="btn" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={adding || !form.firstName || !form.lastName}>
                {adding ? 'Saving...' : editingId ? 'Save Changes' : 'Add Resident'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Resident Cards */}
      {isLoading ? (
        <div className="loading-inline"><div className="loading-spinner" /> Loading residents...</div>
      ) : !residents?.length ? (
        <div className="portal-card-empty" style={{ padding: '40px' }}>
          <Users size={40} style={{ opacity: 0.3 }} />
          <p>No residents registered</p>
        </div>
      ) : (
        <div className="portal-resident-grid" id="portal-resident-list">
          {residents.map((r) => (
            <div key={r.id} className="portal-card portal-resident-card">
              <div className="portal-resident-avatar">
                <User size={24} />
              </div>
              <div className="portal-resident-info">
                <div className="portal-resident-name-row">
                  <span className="portal-resident-name">{r.firstName} {r.lastName}</span>
                  {r.hasPortalAccess && (
                    <span className="portal-portal-badge" title="Has portal access">
                      <ShieldCheck size={12} /> Portal
                    </span>
                  )}
                </div>
                <span className="portal-resident-type">{TYPE_LABELS[r.residentType] || r.residentType}</span>
                {r.relationship && (
                  <span className="portal-resident-detail">{REL_LABELS[r.relationship] || r.relationship}</span>
                )}
                <div className="portal-resident-contacts">
                  {r.mobile && <span><Phone size={12} /> {r.mobile}</span>}
                  {r.email && <span><Mail size={12} /> {r.email}</span>}
                  {r.vehiclePlate && <span><Car size={12} /> {r.vehiclePlate}</span>}
                  {r.moveInDate && <span><Calendar size={12} /> {new Date(r.moveInDate).toLocaleDateString()}</span>}
                </div>
              </div>
              {isPrimaryTenant && r.residentType !== 'primary_tenant' && (
                <div className="portal-resident-actions">
                  {!r.hasPortalAccess && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleInvite(r.id, `${r.firstName} ${r.lastName}`, r.email)}
                      disabled={inviting}
                      title="Invite to portal"
                      id={`invite-resident-${r.id}`}
                    >
                      <Send size={12} /> Invite
                    </button>
                  )}
                  <button className="btn-icon" onClick={() => handleEdit(r)} title="Edit"><Edit2 size={14} /></button>
                  <button className="btn-icon btn-danger" onClick={() => handleRemove(r.id, `${r.firstName} ${r.lastName}`)} title="Remove"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
