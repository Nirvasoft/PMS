-- Advance Rental Fee : floor အလိုက် Charge / Invoice Dept-CC / Journal update
-- (Floor = units.floor_label = department name,  Charge = 'Advance Rental Fee@' + dept code)
-- Test: တစ်ခုတည်းစမ်းချင်ရင် "-- AND i.invoice_number" line ကို uncomment လုပ်ပါ

BEGIN;

-- 1) Invoice line : Charge ကို floor နဲ့ကိုက်တဲ့ Advance Rental Fee@xxx ပြောင်း
UPDATE invoice_lines il
SET charge_type_id = ct.id
FROM invoices i, units u, department_centers d, charge_types ct, charge_types old_ct
WHERE i.id = il.invoice_id
  AND u.id = i.unit_id
  AND d.name = u.floor_label
  AND ct.name = 'Advance Rental Fee@' || d.code
  AND old_ct.id = il.charge_type_id
  AND old_ct.name LIKE 'Advance Rental Fee@%'
  AND il.charge_type_id <> ct.id
  -- AND i.invoice_number = 'INV-001844'
;

-- 2) Invoice : Dept / CC ကို Charge ရဲ့ GL account (2-ALxxxx) ကနေယူ
UPDATE invoices i
SET department_center_id = al.department_center_id,
    cost_center_id       = al.cost_center_id,
    updated_at           = now()
FROM invoice_lines il, charge_types ct, gl_accounts al
WHERE il.invoice_id = i.id
  AND ct.id = il.charge_type_id
  AND ct.name LIKE 'Advance Rental Fee@%'
  AND al.code = ct.gl_account_code
  AND al.company_id = i.company_id
  -- AND i.invoice_number = 'INV-001844'
;

-- 3) Journal Credit line : 2-ALxxxx (floor) + Dept/CC
UPDATE journal_entry_lines jel
SET account_id = al.id,
    department_center_id = al.department_center_id,
    cost_center_id = al.cost_center_id
FROM journal_entries je, invoice_lines il, charge_types ct, gl_accounts al, invoices i
WHERE je.id = jel.journal_entry_id
  AND je.reference_type = 'invoice' AND je.entry_type = 'ar_invoice'
  AND il.invoice_id = je.reference_id
  AND i.id = il.invoice_id
  AND ct.id = il.charge_type_id AND ct.name LIKE 'Advance Rental Fee@%'
  AND al.code = ct.gl_account_code AND al.company_id = i.company_id
  AND jel.credit > 0
  -- AND i.invoice_number = 'INV-001844'
;

-- 4) Journal Debit line : 1-2210 Account Receivable (floor Dept/CC) 
UPDATE journal_entry_lines jel
SET account_id = ar.id,
    department_center_id = ar.department_center_id,
    cost_center_id = ar.cost_center_id
FROM journal_entries je, invoice_lines il, charge_types ct, gl_accounts al, gl_accounts ar, invoices i
WHERE je.id = jel.journal_entry_id
  AND je.reference_type = 'invoice' AND je.entry_type = 'ar_invoice'
  AND il.invoice_id = je.reference_id
  AND i.id = il.invoice_id
  AND ct.id = il.charge_type_id AND ct.name LIKE 'Advance Rental Fee@%'
  AND al.code = ct.gl_account_code AND al.company_id = i.company_id
  AND ar.code = '1-2210' AND ar.company_id = i.company_id
  AND ar.department_center_id = al.department_center_id
  AND ar.cost_center_id = al.cost_center_id
  AND jel.debit > 0
  -- AND i.invoice_number = 'INV-001844'
;

-- စစ်ရန် : INV-001844  (Charge / Dept / Journal account)
SELECT i.invoice_number, u.floor_label, ct.name AS charge, d.code AS inv_dept,
       je.journal_number, ga.code AS gl_code, jd.code AS line_dept, jel.debit, jel.credit
FROM invoices i
JOIN units u ON u.id = i.unit_id
JOIN invoice_lines il ON il.invoice_id = i.id
JOIN charge_types ct ON ct.id = il.charge_type_id
LEFT JOIN department_centers d ON d.id = i.department_center_id
LEFT JOIN journal_entries je ON je.reference_id = i.id AND je.reference_type = 'invoice'
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN gl_accounts ga ON ga.id = jel.account_id
LEFT JOIN department_centers jd ON jd.id = jel.department_center_id
WHERE i.invoice_number = 'INV-001844';

-- Charge ကို floor နဲ့မကိုက်သေးတာ ကျန်သလား (0 ဖြစ်ရမယ်)
SELECT COUNT(*) AS mismatch
FROM invoice_lines il
JOIN invoices i ON i.id = il.invoice_id
JOIN units u ON u.id = i.unit_id
JOIN department_centers d ON d.name = u.floor_label
JOIN charge_types ct ON ct.id = il.charge_type_id
WHERE ct.name LIKE 'Advance Rental Fee@%'
  AND ct.name <> 'Advance Rental Fee@' || d.code;

COMMIT;   -- မှားရင် COMMIT အစား ROLLBACK;
