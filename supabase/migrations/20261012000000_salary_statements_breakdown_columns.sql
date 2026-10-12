-- Migration: Add breakdown allowance & deduction columns to salary_statements
-- Non-destructive additive migration. Existing rows and permissions remain intact.
BEGIN;

ALTER TABLE public.salary_statements
  ADD COLUMN IF NOT EXISTS housing_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payroll_year INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Grant permissions for roles
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.salary_statements TO authenticated;
GRANT ALL ON TABLE public.salary_statements TO service_role;

COMMIT;
