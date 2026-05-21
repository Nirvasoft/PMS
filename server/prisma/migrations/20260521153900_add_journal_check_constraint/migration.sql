-- Add CHECK constraint to ensure journal entries are balanced (total_debit = total_credit)
-- This provides database-level protection against unbalanced journals.
-- Note: Using a tolerance of 0.01 to handle floating point precision issues.
ALTER TABLE journal_entries
  ADD CONSTRAINT chk_journal_balanced
  CHECK (ABS(total_debit - total_credit) < 0.01);

-- Add CHECK constraint for non-negative amounts on journal entry lines
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT chk_line_amounts_positive
  CHECK (debit >= 0 AND credit >= 0);
