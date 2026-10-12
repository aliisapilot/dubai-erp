-- Migration: 20261012010000_integrated_payroll_workflow.sql
-- Description: Non-destructive, additive migration extending employees, salary_statements,
-- and introducing monthly_payroll_adjustments for integrated attendance, overtime & payroll workflow.

BEGIN;

-- 1. Extend employees table with default payroll settings & allowances
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS housing_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overtime_costing_method TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS working_days_divisor INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS overtime_multiplier NUMERIC(4,2) DEFAULT 1.25;

-- 2. Extend salary_statements table with attendance and overtime tracking columns
ALTER TABLE public.salary_statements
  ADD COLUMN IF NOT EXISTS housing_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payroll_year INTEGER,
  ADD COLUMN IF NOT EXISTS present_days NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payable_days NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overtime_costing_method TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS attendance_adjustment NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_adjustment_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Create monthly_payroll_adjustments table for monthly employee charges, attendance adjustments and costing methods
CREATE TABLE IF NOT EXISTS public.monthly_payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- e.g. '2026-10'
  present_days_adjustment NUMERIC(5,2) DEFAULT 0,
  payable_days_adjustment NUMERIC(5,2) DEFAULT 0,
  attendance_remarks TEXT,
  overtime_costing_method TEXT DEFAULT 'auto', -- 'auto' | 'hourly_rate' | 'manual_fixed'
  overtime_rate NUMERIC(10,2) DEFAULT NULL,    -- Custom AED/hr for this month
  overtime_manual_amount NUMERIC(12,2) DEFAULT NULL, -- Flat AED charge entered manually
  overtime_hours_adjustment NUMERIC(8,2) DEFAULT 0,
  overtime_remarks TEXT,
  overtime_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, employee_id, period)
);

-- Index for fast lookup by company, employee and period
CREATE INDEX IF NOT EXISTS idx_monthly_payroll_adj_lookup
  ON public.monthly_payroll_adjustments(company_id, employee_id, period);

-- RLS & Grants
ALTER TABLE public.monthly_payroll_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'monthly_payroll_adjustments' AND policyname = 'monthly_payroll_adjustments_authenticated'
  ) THEN
    CREATE POLICY monthly_payroll_adjustments_authenticated
      ON public.monthly_payroll_adjustments
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.monthly_payroll_adjustments TO authenticated;
GRANT ALL ON TABLE public.monthly_payroll_adjustments TO service_role;

COMMIT;
