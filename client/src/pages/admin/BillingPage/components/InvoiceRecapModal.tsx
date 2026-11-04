import React, { useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { Table2, X } from 'lucide-react';
import { useGetCurrencyRatesQuery } from '../../../../store/api/billingApi';
import { useGetGlAccountsQuery, type GlAccount } from '../../../../store/api/glApi';

export interface RecapCenterInfo {
  id?: string;
  code: string;
  name?: string | null;
}

export interface RecapLineInput {
  description?: string | null;
  amount: number;
  taxAmount?: number;
  lineTotal?: number;
  glAccountCode?: string | null;
  chargeTypeName?: string | null;
  chargeTypeCode?: string | null;
  departmentCenter?: RecapCenterInfo | null;
  costCenter?: RecapCenterInfo | null;
}

export interface InvoiceRecapModalProps {
  open: boolean;
  onClose: () => void;
  propertyId?: string;
  invoiceNumber?: string | null;
  externalInvoiceNumber?: string | null;
  secondRef?: string | null;
  notes?: string | null;
  currency?: string | null;
  currencyRate?: number | string | null;
  tenantGlAccountCode?: string | null;
  departmentCenter?: RecapCenterInfo | null;
  costCenter?: RecapCenterInfo | null;
  totalAmount: number;
  taxAmount?: number;
  lines: RecapLineInput[];
}

interface RecapRow {
  accountCode: string;
  description: string;
  department: string;
  costCentre: string;
  debit: number;
  credit: number;
  debitBase: number;
  creditBase: number;
}

const formatRecapAmount = (value: number): string => {
  if (!Number.isFinite(value)) return '0.0000';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
};

const formatCenterLabel = (center?: RecapCenterInfo | null): string => {
  if (!center) return '-';
  const code = (center.code || '').trim();
  const name = (center.name || '').trim();
  if (code && name && name.toLowerCase() !== code.toLowerCase()) {
    if (name.toLowerCase().startsWith(code.toLowerCase())) return name;
    return `${code}-${name}`;
  }
  return code || name || '-';
};

export const InvoiceRecapModal: React.FC<InvoiceRecapModalProps> = ({
  open,
  onClose,
  propertyId,
  invoiceNumber,
  externalInvoiceNumber,
  secondRef,
  notes,
  currency,
  currencyRate,
  tenantGlAccountCode,
  departmentCenter,
  costCenter,
  totalAmount,
  taxAmount = 0,
  lines,
}) => {
  const [showDepartment, setShowDepartment] = useState(false);
  const [showCostCentre, setShowCostCentre] = useState(false);

  const { data: glAccounts = [] } = useGetGlAccountsQuery(
    propertyId ? { propertyId } : {},
    { skip: !open },
  );

  const { data: currencyRatesData } = useGetCurrencyRatesQuery(
    open && propertyId ? { propertyId } : skipToken,
  );
  const currencyRates = currencyRatesData?.data ?? [];

  const toBaseAmount = (amount: number): number => {
    if (!amount) return 0;
    const curr = (currency || '').trim();
    const rateRow = curr ? currencyRates.find((r) => r.currency === curr) : undefined;
    if (rateRow?.isBaseCurrency) return amount;

    const explicitRate = Number(currencyRate);
    const liveRate = rateRow ? Number(rateRow.rate) : NaN;
    const effectiveRate =
      Number.isFinite(explicitRate) && explicitRate > 0
        ? explicitRate
        : Number.isFinite(liveRate) && liveRate > 0
        ? liveRate
        : 1;

    if (effectiveRate === 1) return amount;
    if (rateRow?.operator === 'divide') {
      return amount / effectiveRate;
    }
    return amount * effectiveRate;
  };

  const rows = useMemo<RecapRow[]>(() => {
    const deptId = departmentCenter?.id || null;
    const ccId = costCenter?.id || null;

    const resolveAccount = (
      preferredCode: string | null | undefined,
      lineDeptId?: string | null,
      lineCcId?: string | null,
      isAr = false,
    ): GlAccount | undefined => {
      const normCode = (preferredCode || '').trim().toLowerCase();
      const targetDeptId = lineDeptId ?? deptId;
      const targetCcId = lineCcId ?? ccId;

      const isCodeMatch = (a: GlAccount) =>
        Boolean(normCode) && (a.code || '').trim().toLowerCase() === normCode;

      const isArCandidate = (a: GlAccount) => {
        if (a.accountType !== 'asset') return false;
        if (isCodeMatch(a)) return true;
        const c = (a.code || '').trim().toLowerCase();
        const n = (a.name || '').trim().toLowerCase();
        if (c === '1-2210' || c === '1200' || c.startsWith('1-22')) return true;
        if (n.includes('receivable') || /\ba\/?r\b/i.test(n)) return true;
        return false;
      };

      if (isAr) {
        if (targetDeptId && targetCcId) {
          const exactCode = glAccounts.find(
            (a) => isCodeMatch(a) && a.departmentCenterId === targetDeptId && a.costCenterId === targetCcId,
          );
          if (exactCode) return exactCode;
          const exactAr = glAccounts.find(
            (a) => isArCandidate(a) && a.departmentCenterId === targetDeptId && a.costCenterId === targetCcId,
          );
          if (exactAr) return exactAr;
        }
        if (targetDeptId) {
          const deptCode = glAccounts.find(
            (a) => isCodeMatch(a) && a.departmentCenterId === targetDeptId,
          );
          if (deptCode) return deptCode;
          const deptAr = glAccounts.find(
            (a) => isArCandidate(a) && a.departmentCenterId === targetDeptId,
          );
          if (deptAr) return deptAr;
        }
        if (targetCcId) {
          const ccCode = glAccounts.find(
            (a) => isCodeMatch(a) && a.costCenterId === targetCcId,
          );
          if (ccCode) return ccCode;
          const ccAr = glAccounts.find(
            (a) => isArCandidate(a) && a.costCenterId === targetCcId,
          );
          if (ccAr) return ccAr;
        }
        return (
          glAccounts.find((a) => isCodeMatch(a)) ||
          glAccounts.find((a) => isArCandidate(a))
        );
      }

      if (!normCode) return undefined;
      if (targetDeptId && targetCcId) {
        const exact = glAccounts.find(
          (a) => isCodeMatch(a) && a.departmentCenterId === targetDeptId && a.costCenterId === targetCcId,
        );
        if (exact) return exact;
      }
      if (targetDeptId) {
        const byDept = glAccounts.find(
          (a) => isCodeMatch(a) && a.departmentCenterId === targetDeptId,
        );
        if (byDept) return byDept;
      }
      if (targetCcId) {
        const byCc = glAccounts.find(
          (a) => isCodeMatch(a) && a.costCenterId === targetCcId,
        );
        if (byCc) return byCc;
      }
      return glAccounts.find((a) => isCodeMatch(a));
    };

    // 1. AR Debit Row
    const arAcc = resolveAccount(tenantGlAccountCode || '1-2210', deptId, ccId, true);
    const arCode = arAcc?.code || tenantGlAccountCode || '1-2210';
    const arDesc = arAcc?.name || 'Account Receivable';
    const arDept = formatCenterLabel(departmentCenter || arAcc?.departmentCenter);
    const arCc = formatCenterLabel(costCenter || arAcc?.costCenter);

    // Build Credit description matching ERP format: e.g. "INV-000001, INV-001845, PMS: INV-001845"
    const buildCreditDescription = (line: RecapLineInput, revAcc?: GlAccount): string => {
      if (invoiceNumber) {
        const parts: string[] = [];
        const addUnique = (val?: string | null) => {
          const trimmed = (val || '').trim();
          if (trimmed && !parts.includes(trimmed)) {
            parts.push(trimmed);
          }
        };
        if (externalInvoiceNumber && externalInvoiceNumber !== invoiceNumber) {
          addUnique(externalInvoiceNumber);
        } else if (secondRef && secondRef !== invoiceNumber) {
          addUnique(secondRef);
        }
        addUnique(invoiceNumber);
        if (externalInvoiceNumber && secondRef && secondRef !== externalInvoiceNumber && secondRef !== invoiceNumber) {
          addUnique(secondRef);
        }
        const remarkText = (notes || '').trim() || `PMS: ${invoiceNumber}`;
        addUnique(remarkText);
        return parts.join(', ');
      }

      // Draft preview on CreateInvoicePage
      const draftParts: string[] = [];
      if (secondRef?.trim()) draftParts.push(secondRef.trim());
      if (notes?.trim()) draftParts.push(notes.trim());
      if (line.description?.trim()) draftParts.push(line.description.trim());
      else if (revAcc?.name) draftParts.push(revAcc.name);
      else if (line.chargeTypeName) draftParts.push(line.chargeTypeName);
      return draftParts.join(', ') || 'Account Revenue';
    };

    const hasTaxRow = Number(taxAmount) > 0;
    const creditRows: RecapRow[] = lines.map((line) => {
      const lineDept = line.departmentCenter || departmentCenter;
      const lineCc = line.costCenter || costCenter;
      const revAcc = resolveAccount(
        line.glAccountCode,
        lineDept?.id || null,
        lineCc?.id || null,
        false,
      );
      const code = revAcc?.code || line.glAccountCode || '4-IW0001';
      const desc = buildCreditDescription(line, revAcc);
      const creditAmt = hasTaxRow
        ? Number(line.amount) || 0
        : Number(line.lineTotal ?? line.amount) || 0;

      return {
        accountCode: code,
        description: desc,
        department: formatCenterLabel(lineDept || revAcc?.departmentCenter),
        costCentre: formatCenterLabel(lineCc || revAcc?.costCenter),
        debit: 0,
        credit: creditAmt,
        debitBase: 0,
        creditBase: toBaseAmount(creditAmt),
      };
    });

    if (hasTaxRow) {
      const taxAcc = resolveAccount('2200', deptId, ccId, false);
      const taxAmt = Number(taxAmount) || 0;
      creditRows.push({
        accountCode: taxAcc?.code || '2200',
        description: taxAcc?.name || 'Tax Payable',
        department: formatCenterLabel(departmentCenter || taxAcc?.departmentCenter),
        costCentre: formatCenterLabel(costCenter || taxAcc?.costCenter),
        debit: 0,
        credit: taxAmt,
        debitBase: 0,
        creditBase: toBaseAmount(taxAmt),
      });
    }

    const computedCreditSum = creditRows.reduce((s, r) => s + r.credit, 0);
    const debitTotal = Number(totalAmount) > 0 ? Number(totalAmount) : computedCreditSum;

    const arRow: RecapRow = {
      accountCode: arCode,
      description: arDesc,
      department: arDept,
      costCentre: arCc,
      debit: debitTotal,
      credit: 0,
      debitBase: toBaseAmount(debitTotal),
      creditBase: 0,
    };

    return [arRow, ...creditRows];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    glAccounts,
    departmentCenter,
    costCenter,
    tenantGlAccountCode,
    invoiceNumber,
    externalInvoiceNumber,
    secondRef,
    notes,
    totalAmount,
    taxAmount,
    lines,
    currency,
    currencyRate,
    currencyRates,
  ]);

  if (!open) return null;

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalDebitBase = rows.reduce((s, r) => s + r.debitBase, 0);
  const totalCreditBase = rows.reduce((s, r) => s + r.creditBase, 0);

  return (
    <div className="recap-modal-overlay" onClick={onClose}>
      <div
        className={`recap-modal-dialog ${showDepartment || showCostCentre ? 'recap-modal-dialog--expanded' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="recap-modal-header">
          <div className="recap-modal-title-group">
            <span className="recap-modal-icon">
              <Table2 size={16} />
            </span>
            <span className="recap-modal-title">Recap</span>
            {invoiceNumber && (
              <span className="recap-modal-badge">{invoiceNumber}</span>
            )}
          </div>
          <button
            type="button"
            className="recap-modal-close"
            onClick={onClose}
            aria-label="Close Recap"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="recap-modal-body">
          <div className="recap-modal-controls">
            <label className="recap-checkbox-label">
              <input
                type="checkbox"
                className="inv-checkbox"
                checked={showDepartment}
                onChange={(e) => setShowDepartment(e.target.checked)}
              />
              <span>Show Department</span>
            </label>
            <label className="recap-checkbox-label">
              <input
                type="checkbox"
                className="inv-checkbox"
                checked={showCostCentre}
                onChange={(e) => setShowCostCentre(e.target.checked)}
              />
              <span>Show Cost Centre</span>
            </label>
          </div>

          <div className="recap-table-container">
            <table className="recap-table">
              <thead>
                <tr>
                  <th className="recap-col-code">Account Code</th>
                  <th className="recap-col-desc">Description</th>
                  {showDepartment && <th className="recap-col-dept">Department</th>}
                  {showCostCentre && <th className="recap-col-cc">Cost Centre</th>}
                  <th className="recap-col-num">Debit</th>
                  <th className="recap-col-num">Credit</th>
                  <th className="recap-col-num">Debit (in Base)</th>
                  <th className="recap-col-num">Credit (in Base)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'recap-row-even' : 'recap-row-odd'}>
                    <td className="recap-cell-text recap-col-code">
                      <span className="recap-account-code">{row.accountCode}</span>
                    </td>
                    <td className="recap-cell-text recap-col-desc">{row.description}</td>
                    {showDepartment && <td className="recap-cell-text recap-col-dept">{row.department}</td>}
                    {showCostCentre && <td className="recap-cell-text recap-col-cc">{row.costCentre}</td>}
                    <td className="recap-cell-num recap-col-num">{row.debit > 0 ? formatRecapAmount(row.debit) : ''}</td>
                    <td className="recap-cell-num recap-col-num">{row.credit > 0 ? formatRecapAmount(row.credit) : ''}</td>
                    <td className="recap-cell-num recap-col-num">{row.debitBase > 0 ? formatRecapAmount(row.debitBase) : ''}</td>
                    <td className="recap-cell-num recap-col-num">{row.creditBase > 0 ? formatRecapAmount(row.creditBase) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="recap-total-row">
                  <td className="recap-col-code"></td>
                  <td className="recap-cell-text recap-col-desc recap-total-label">Total</td>
                  {showDepartment && <td className="recap-col-dept"></td>}
                  {showCostCentre && <td className="recap-col-cc"></td>}
                  <td className="recap-cell-num recap-col-num recap-total-num">{formatRecapAmount(totalDebit)}</td>
                  <td className="recap-cell-num recap-col-num recap-total-num">{formatRecapAmount(totalCredit)}</td>
                  <td className="recap-cell-num recap-col-num recap-total-num">{formatRecapAmount(totalDebitBase)}</td>
                  <td className="recap-cell-num recap-col-num recap-total-num">{formatRecapAmount(totalCreditBase)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceRecapModal;
