import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetChargeTypesQuery, useCreateInvoiceMutation } from '../../../store/api/billingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { ArrowLeft, Plus, Trash2, FileText, ClipboardList, Building2, Send } from 'lucide-react';
import { useAlertDialog } from '../../../components/DialogProvider';
import { PermissionGuard } from '../../../components/guards/PermissionGuard';
import './BillingPage.css';

interface LineItem {
  chargeTypeId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export default function CreateInvoicePage() {
  const navigate = useNavigate();
  const { data: chargeTypesData } = useGetChargeTypesQuery();
  const { data: propertiesData } = useGetPropertiesQuery({ page: 1, limit: 100 });
  const { data: tenantsData } = useGetTenantsQuery({ page: 1, limit: 200 });
  const [createInvoice, { isLoading }] = useCreateInvoiceMutation();
  const alertDialog = useAlertDialog();

  const chargeTypes = chargeTypesData?.data || [];
  const properties = propertiesData?.data || [];
  const tenants = tenantsData?.data || [];

  const [form, setForm] = useState({
    propertyId: '', tenantId: '', invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '', notes: '',
  });

  const [lines, setLines] = useState<LineItem[]>([
    { chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0 },
  ]);

  const addLine = () => setLines([...lines, { chargeTypeId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: unknown) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = value;

    // Auto-fill description from charge type
    if (field === 'chargeTypeId') {
      const ct = chargeTypes.find(c => c.id === value);
      if (ct && !updated[idx].description) updated[idx].description = ct.name;
      if (ct && ct.isTaxable && updated[idx].taxRate === 0) updated[idx].taxRate = Number(ct.taxRate) || 0;
    }
    setLines(updated);
  };

  // Live totals
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.taxRate, 0);
  const total = subtotal + tax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createInvoice({
        ...form,
        lines: lines.map(l => ({
          chargeTypeId: l.chargeTypeId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
        })),
      }).unwrap();
      navigate(`/admin/billing/invoices/${result.data.id}`);
    } catch (err: any) {
      alertDialog(err?.data?.errors?.[0]?.message || 'Failed to create invoice');
    }
  };

  return (
    <div className="billing-page">
      <button className="inv-back-btn" onClick={() => navigate('/admin/billing/invoices')}>
        <ArrowLeft size={14} /> Back to Invoices
      </button>

      <div className="page-header" style={{ marginBottom: 28 }}>
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
            <FileText size={22} />
          </div>
          <div>
            <h1>Create Invoice</h1>
            <p>Create a manual ad-hoc invoice for a tenant</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Section 1: Invoice Details ── */}
        <div className="inv-form-section">
          <div className="inv-form-section-header">
            <div className="section-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
              <Building2 size={16} />
            </div>
            <div>
              <h3>Invoice Details</h3>
              <p>Select the property, tenant, and billing dates</p>
            </div>
          </div>

          <div className="inv-form-grid">
            <div className="inv-field">
              <label>Property <span className="req">*</span></label>
              <select required value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })}>
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="inv-field">
              <label>Tenant <span className="req">*</span></label>
              <select required value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
                <option value="">Select tenant</option>
                {tenants
                  .map((t: any) => ({
                    id: t.id,
                    label: t.tenantType !== 'individual'
                      ? (t.companyName || '').trim()
                      : `${t.firstName || ''} ${t.lastName || ''}`.trim(),
                  }))
                  .filter(t => t.label !== '')
                  .map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
              </select>
            </div>
            <div className="inv-field">
              <label>Invoice Date <span className="req">*</span></label>
              <input type="date" required value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div className="inv-field">
              <label>Due Date <span className="req">*</span></label>
              <input type="date" required value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>

          <div className="inv-form-grid cols-1" style={{ marginTop: 16 }}>
            <div className="inv-field">
              <label>Notes</label>
              <textarea rows={2} placeholder="Optional notes for this invoice…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </div>

        {/* ── Section 2: Line Items ── */}
        <div className="inv-form-section">
          <div className="inv-form-section-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="section-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                <ClipboardList size={16} />
              </div>
              <div>
                <h3>Line Items</h3>
                <p>Add charges to this invoice</p>
              </div>
            </div>
            <button type="button" className="add-line-btn" onClick={addLine}>
              <Plus size={13} /> Add Line
            </button>
          </div>

          <table className="inv-lines-table">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Charge Type</th>
                <th style={{ width: '28%' }}>Description</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Unit Price</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Tax %</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Total</th>
                <th style={{ width: '5%' }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const lineAmt = line.quantity * line.unitPrice;
                const lineTax = lineAmt * line.taxRate;
                const lineTotal = lineAmt + lineTax;
                return (
                  <tr key={idx}>
                    <td>
                      <select className="line-select" required value={line.chargeTypeId} onChange={e => updateLine(idx, 'chargeTypeId', e.target.value)}>
                        <option value="">Select…</option>
                        {chargeTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="line-input" required placeholder="Charge description" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} />
                    </td>
                    <td>
                      <input type="number" className="line-input" min={0} step={1} value={line.quantity} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} />
                    </td>
                    <td>
                      <input type="number" className="line-input" min={0} step={0.01} value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value))} />
                    </td>
                    <td>
                      <input type="number" className="line-input" min={0} max={100} step={0.1} value={Math.round(line.taxRate * 10000) / 100}
                        onChange={e => updateLine(idx, 'taxRate', Number(e.target.value) / 100)} />
                    </td>
                    <td>
                      <div className="line-total">{formatCurrency(lineTotal)}</div>
                    </td>
                    <td>
                      {lines.length > 1 && (
                        <button type="button" className="line-remove-btn" onClick={() => removeLine(idx)} title="Remove line">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer: Totals + Submit ── */}
        <div className="inv-form-footer">
          <div className="inv-totals-card">
            <div className="inv-totals-row">
              <span className="t-label">Subtotal</span>
              <span className="t-value">{formatCurrency(subtotal)}</span>
            </div>
            <div className="inv-totals-row">
              <span className="t-label">Tax</span>
              <span className="t-value">{formatCurrency(tax)}</span>
            </div>
            <div className="inv-totals-row total-grand">
              <span className="t-label">Total</span>
              <span className="t-value">{formatCurrency(total)}</span>
            </div>
          </div>
          <PermissionGuard permission="billing-invoices.write">
            <button type="submit" className="inv-submit-btn" disabled={isLoading}>
              <Send size={16} />
              {isLoading ? 'Creating…' : 'Create Invoice'}
            </button>
          </PermissionGuard>
        </div>
      </form>
    </div>
  );
}
