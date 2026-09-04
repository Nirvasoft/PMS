import { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import type { LeaseDetail } from '../../../../../../store/api/leasesApi';

const COMMERCIAL_TAX_RATE = 0.05; // 5%

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

export function InvoicePreviewModal({ lease, onClose }: { lease: LeaseDetail; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const currency = lease.currency || lease.property.currency || 'MMK';
  const rent = Number(lease.rentAmount) || 0;
  const months = lease.leaseTermMonths || 0;
  const rentAmount = rent * months;
  const planUnit = lease.unit.areaSqft ?? null;

  // Extra charges from the lease (excluding rent, which is the main line)
  const extraCharges = (lease.leaseCharges || [])
    .filter((c) => c.chargeType.category !== 'rent')
    .map((c) => ({ name: c.chargeType.name, amount: Number(c.amount) }));

  const subtotal = rentAmount + extraCharges.reduce((s, c) => s + c.amount, 0);
  const discount = 0;
  const taxable = subtotal - discount;
  const commercialTax = taxable * COMMERCIAL_TAX_RATE;
  const totalCurrentCharge = taxable + commercialTax;

  const invoiceNo = `RINV-${lease.leaseNumber}`;
  const dateStr = fmtDate(new Date());

  const isCompany = lease.tenant.tenantType !== 'individual';
  const customerId = isCompany ? '-' : (lease.tenant.firstName || '-');
  const customerName = isCompany ? (lease.tenant.companyName || '') : (lease.tenant.lastName || '');

  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>${invoiceNo}</title>
      <style>${PRINT_CSS}</style></head><body>${node.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    // Give the new document a tick to lay out before printing
    setTimeout(() => { win.print(); win.close(); }, 250);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box invoice-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Invoice Preview</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="invoice-modal-body">
          {/* The printable invoice */}
          <div className="invoice-paper" ref={printRef}>
            <div className="inv-title">Lease Preview</div>

            <div className="inv-meta">
              <span className="inv-meta-label">Customer ID</span><span className="inv-meta-colon">:</span><span className="inv-meta-value">{customerId}</span>
              <span className="inv-meta-label">Customer Name</span><span className="inv-meta-colon">:</span><span className="inv-meta-value">{customerName}</span>
              <span className="inv-meta-label">Invoice No</span><span className="inv-meta-colon">:</span><span className="inv-meta-value">{invoiceNo}</span>
              <span className="inv-meta-label">Date</span><span className="inv-meta-colon">:</span><span className="inv-meta-value">{dateStr}</span>
              <span className="inv-meta-label">Refer No</span><span className="inv-meta-colon">:</span><span className="inv-meta-value">{lease.unit.unitNumber}</span>
            </div>

            <table className="inv-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="inv-desc-col">Description</th>
                  <th rowSpan={2} className="inv-month-col">Month</th>
                  <th className="inv-num-col">Price Per Unit</th>
                  <th className="inv-num-col">Amount</th>
                </tr>
                <tr>
                  <th className="inv-num-col inv-cur">{currency}</th>
                  <th className="inv-num-col inv-cur">{currency}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="inv-desc-cell">
                    <div className="inv-desc-grid">
                      <div className="inv-desc-name">
                        <div className="inv-desc-main">Room</div>
                        <div className="inv-desc-line2">Room Advance Rental Fee</div>
                      </div>
                      <div className="inv-desc-field">
                        <div className="inv-desc-flabel"><u>Advance Fee</u></div>
                        <div className="inv-desc-fval">{money(rent)}</div>
                      </div>
                      {planUnit != null && (
                        <div className="inv-desc-field">
                          <div className="inv-desc-flabel"><u>Plan Unit</u></div>
                          <div className="inv-desc-fval">{planUnit.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="inv-center">{months}</td>
                  <td className="inv-num inv-boxed">{money(rent)}</td>
                  <td className="inv-num inv-boxed">{money(rentAmount)}</td>
                </tr>

                {extraCharges.map((c, i) => (
                  <tr key={i}>
                    <td className="inv-desc-cell"><div className="inv-desc-main">{c.name}</div></td>
                    <td className="inv-center">—</td>
                    <td className="inv-num inv-boxed">{money(c.amount)}</td>
                    <td className="inv-num inv-boxed">{money(c.amount)}</td>
                  </tr>
                ))}

                <tr>
                  <td className="inv-blank" colSpan={2}></td>
                  <td className="inv-label-cell">Total :</td>
                  <td className="inv-num inv-boxed">{money(subtotal)}</td>
                </tr>
                <tr>
                  <td className="inv-blank" colSpan={2}></td>
                  <td className="inv-label-cell">Discount :</td>
                  <td className="inv-num inv-boxed">{money(discount)}</td>
                </tr>
                <tr>
                  <td className="inv-blank" colSpan={2}></td>
                  <td className="inv-label-cell">Commercial Tax :</td>
                  <td className="inv-num">{money(commercialTax)}</td>
                </tr>
                <tr>
                  <td className="inv-blank" colSpan={2}></td>
                  <td className="inv-label-cell inv-grand">Total Current Charge :</td>
                  <td className="inv-num inv-boxed inv-grand">{money(totalCurrentCharge)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost-sm" onClick={onClose}>Close</button>
          <button className="btn-primary-sm" onClick={handlePrint}>
            <Printer size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} /> Print
          </button>
        </div>
      </div>
    </div>
  );
}

// Standalone CSS injected into the print window so the printout is self-contained.
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; background: #fff; }
  .inv-title { color: #2f6fd0; font-size: 20px; font-weight: 700; margin-bottom: 12px; }
  .inv-meta { display: grid; grid-template-columns: auto auto auto; justify-content: end; column-gap: 8px; row-gap: 10px; font-size: 14px; margin-bottom: 20px; color: #000; }
  .inv-meta-label { text-align: right; font-weight: 400; }
  .inv-meta-colon { text-align: center; }
  .inv-meta-value { text-align: left; }
  .inv-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .inv-table th, .inv-table td { border: 1px solid #333; padding: 8px 10px; }
  .inv-desc-col { text-align: center; }
  .inv-month-col, .inv-num-col { text-align: center; }
  .inv-cur { font-weight: 400; }
  .inv-center { text-align: center; }
  .inv-num { text-align: right; }
  .inv-boxed { background: #f2f2f4; }
  .inv-desc-grid { display: flex; align-items: flex-start; gap: 48px; }
  .inv-desc-name { flex: 1; }
  .inv-desc-main { font-weight: 600; }
  .inv-desc-line2 { margin-top: 4px; }
  .inv-desc-field { text-align: right; min-width: 110px; }
  .inv-desc-flabel { margin-bottom: 4px; }
  .inv-desc-fval { }
  .inv-blank { border: none !important; }
  .inv-label-cell { text-align: right; font-weight: 600; }
  .inv-grand { font-weight: 700; }
`;
