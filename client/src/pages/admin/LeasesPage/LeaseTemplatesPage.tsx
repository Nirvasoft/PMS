import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useGetLeaseTemplatesQuery, useCreateLeaseTemplateMutation,
  type LeaseTemplate,
} from '../../../store/api/leasesApi';
import {
  ArrowLeft, FileText, Plus, X, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import './LeaseTemplatesPage.css';

const PROPERTY_TYPES = ['residential', 'commercial', 'industrial', 'mixed_use', 'retail'];

export default function LeaseTemplatesPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useGetLeaseTemplatesQuery();
  const [create, { isLoading: creating }] = useCreateLeaseTemplateMutation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    propertyType: '',
    description: '',
    defaultTerms: {
      billingCycle: 'monthly',
      billingDay: 1,
      paymentDueDays: 7,
      escalationType: '',
      escalationValue: '',
      escalationFrequency: 'annual',
    },
  });

  const templates = data?.data || [];

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    try {
      await create({
        name: form.name,
        propertyType: form.propertyType || null,
        description: form.description || null,
        defaultTerms: {
          ...form.defaultTerms,
          escalationType: form.defaultTerms.escalationType || null,
          escalationValue: form.defaultTerms.escalationValue ? Number(form.defaultTerms.escalationValue) : null,
        },
        clauses: [],
      }).unwrap();
      toast.success('Template created');
      setShowForm(false);
      setForm({ name: '', propertyType: '', description: '', defaultTerms: { billingCycle: 'monthly', billingDay: 1, paymentDueDays: 7, escalationType: '', escalationValue: '', escalationFrequency: 'annual' } });
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed');
    }
  };

  return (
    <div className="lt-page">
      <div className="lt-header">
        <button className="back-btn" onClick={() => navigate('/admin/leases')}>
          <ArrowLeft size={16} /> Leases
        </button>
        <div className="lt-title-row">
          <h1><FileText size={22} /> Lease Templates</h1>
          <p className="lt-subtitle">Manage reusable lease templates with default terms. Templates can be selected when creating new leases.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> New Template
        </button>
      </div>

      {showForm && (
        <div className="lt-form card">
          <h3>New Lease Template</h3>
          <div className="lt-form-grid">
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Template Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Residential 12-Month" />
            </div>
            <div className="field">
              <label>Property Type</label>
              <select value={form.propertyType} onChange={(e) => setForm({ ...form, propertyType: e.target.value })}>
                <option value="">All Types</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
            </div>

            <div className="field-group-label" style={{ gridColumn: 'span 2' }}>Default Terms</div>
            <div className="field">
              <label>Billing Cycle</label>
              <select value={form.defaultTerms.billingCycle} onChange={(e) => setForm({ ...form, defaultTerms: { ...form.defaultTerms, billingCycle: e.target.value } })}>
                {['monthly','quarterly','semi_annual','annual'].map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Billing Day</label>
              <input type="number" min={1} max={28} value={form.defaultTerms.billingDay} onChange={(e) => setForm({ ...form, defaultTerms: { ...form.defaultTerms, billingDay: Number(e.target.value) } })} />
            </div>
            <div className="field">
              <label>Payment Due Days</label>
              <input type="number" min={1} max={30} value={form.defaultTerms.paymentDueDays} onChange={(e) => setForm({ ...form, defaultTerms: { ...form.defaultTerms, paymentDueDays: Number(e.target.value) } })} />
            </div>
            <div className="field">
              <label>Escalation Type</label>
              <select value={form.defaultTerms.escalationType} onChange={(e) => setForm({ ...form, defaultTerms: { ...form.defaultTerms, escalationType: e.target.value } })}>
                <option value="">None</option>
                {['fixed_percent','fixed_amount','cpi'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="lt-form-actions">
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Template'}
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <div className="loading-center">Loading…</div>}

      {!isLoading && templates.length === 0 && (
        <div className="empty-state">
          <FileText size={40} />
          <h3>No Lease Templates</h3>
          <p>Create templates to speed up lease creation with pre-filled default terms.</p>
        </div>
      )}

      <div className="lt-grid">
        {templates.map((t: LeaseTemplate) => {
          const terms = (t.defaultTerms || {}) as Record<string, unknown>;
          return (
            <div key={t.id} className={`lt-card ${t.isActive ? '' : 'inactive'}`}>
              <div className="lt-card-header">
                <h3>{t.name}</h3>
                {t.propertyType && <span className="lt-type-badge">{t.propertyType.replace(/_/g, ' ')}</span>}
                {!t.isActive && <span className="lt-inactive-badge">Inactive</span>}
              </div>
              {t.description && <p className="lt-card-desc">{t.description}</p>}
              <div className="lt-card-terms">
                {terms.billingCycle && <span>Billing: {String(terms.billingCycle).replace(/_/g, ' ')}</span>}
                {terms.paymentDueDays && <span>Due: {String(terms.paymentDueDays)}d</span>}
                {terms.escalationType && <span>Escalation: {String(terms.escalationType).replace(/_/g, ' ')}</span>}
              </div>
              <div className="lt-card-footer">
                <span className="lt-date">Created {new Date(t.createdAt).toLocaleDateString()}</span>
                <span className="lt-clauses">{(t.clauses as unknown[]).length} clauses</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
