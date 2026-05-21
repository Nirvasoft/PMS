import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetChargeTypesQuery, useCreateInvoiceMutation } from '../../../store/api/billingApi';
import { useGetPropertiesQuery } from '../../../store/api/propertiesApi';
import { useGetTenantsQuery } from '../../../store/api/tenantsApi';
import { ArrowLeft, Plus, Trash2, FileText } from 'lucide-react';
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
      alert(err?.data?.message || 'Failed to create invoice');
    }
  };

  return (
    <div className="billing-page">
      <button className="btn btn-secondary" onClick={() => navigate('/admin/billing/invoices')} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div className="page-header" style={{ marginBottom: 24 }}>
        <div className="page-title-row">
          <div className="page-icon-lg" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
            <FileText size={22} />
          </div>
          <div>
            <h1>Create Invoice</h1>
            <p>Manual ad-hoc invoice</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Basic Details */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Invoice Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label className="form-label">Property *</label>
              <select className="form-input" required value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })}>
                <option value="">Select property</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Tenant *</label>
              <select className="form-input" required value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
                <option value="">Select tenant</option>
                {tenants.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.tenantType === 'company' ? t.companyName : `${t.firstName || ''} ${t.lastName || ''}`.trim()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Invoice Date *</label>
              <input type="date" className="form-input" required value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Due Date *</label>
              <input type="date" className="form-input" required value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        {/* Line Items */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>Line Items</h3>
            <button type="button" className="btn btn-secondary" onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <Plus size={12} /> Add Line
            </button>
          </div>
          <table className="line-items-table">
            <thead>
              <tr>
                <th>Charge Type</th>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 120 }}>Unit Price</th>
                <th style={{ width: 100 }}>Tax %</th>
                <th className="text-right" style={{ width: 120 }}>Total</th>
                <th style={{ width: 40 }}></th>
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
                      <select className="form-input" required value={line.chargeTypeId} onChange={e => updateLine(idx, 'chargeTypeId', e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }}>
                        <option value="">Select</option>
                        {chargeTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="form-input" required value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} style={{ fontSize: 12, padding: '6px 8px' }} />
                    </td>
                    <td>
                      <input type="number" className="form-input" min={0} step={1} value={line.quantity} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} style={{ fontSize: 12, padding: '6px 8px' }} />
                    </td>
                    <td>
                      <input type="number" className="form-input" min={0} step={0.01} value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value))} style={{ fontSize: 12, padding: '6px 8px' }} />
                    </td>
                    <td>
                      <input type="number" className="form-input" min={0} max={100} step={0.1} value={line.taxRate * 100}
                        onChange={e => updateLine(idx, 'taxRate', Number(e.target.value) / 100)}
                        style={{ fontSize: 12, padding: '6px 8px' }} />
                    </td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(lineTotal)}</td>
                    <td>
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals Preview + Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, alignItems: 'flex-start' }}>
          <div className="invoice-totals-panel" style={{ width: 320 }}>
            <div className="invoice-total-row">
              <span className="label">Subtotal</span>
              <span className="amount">{formatCurrency(subtotal)}</span>
            </div>
            <div className="invoice-total-row">
              <span className="label">Tax</span>
              <span className="amount">{formatCurrency(tax)}</span>
            </div>
            <div className="invoice-total-row total-main">
              <span className="label">Total</span>
              <span className="amount">{formatCurrency(total)}</span>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ padding: '12px 32px', fontSize: 14 }}>
            {isLoading ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
