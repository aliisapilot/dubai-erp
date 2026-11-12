-- ============================================================
-- Dubai ERP — Customer Initial Opening Balance & Audit Log Migration
-- Safe & Idempotent SQL Migration
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================

-- 1. Extend Customers Table with Opening Balance fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS opening_balance_date DATE DEFAULT CURRENT_DATE;

-- Comment for documentation
COMMENT ON COLUMN public.customers.opening_balance IS 'Initial opening balance brought forward for customer statement of account (AED).';
COMMENT ON COLUMN public.customers.opening_balance_date IS 'Effective date as of which the opening balance is brought forward.';

-- 2. Create Customer Opening Balance Audit History Table
CREATE TABLE IF NOT EXISTS public.customer_opening_balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  old_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  new_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT
);

-- 3. High-Performance Indexes for Isolation and Audit Queries
CREATE INDEX IF NOT EXISTS idx_customer_opening_balance_history_cust 
  ON public.customer_opening_balance_history(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_opening_balance_history_company 
  ON public.customer_opening_balance_history(company_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.customer_opening_balance_history ENABLE ROW LEVEL SECURITY;

-- 5. Multi-Tenant Company Isolation Policy
DROP POLICY IF EXISTS "company_customer_opening_balance_history" ON public.customer_opening_balance_history;
CREATE POLICY "company_customer_opening_balance_history" ON public.customer_opening_balance_history
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 6. Permissions Grant to Authenticated Role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_opening_balance_history TO authenticated;

-- 7. Reload PostgREST schema cache so new columns are immediately available
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification Queries (Run after migration to confirm setup)
-- ============================================================
-- 1. Verify customer columns:
-- SELECT column_name, data_type, column_default, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'customers' AND column_name IN ('opening_balance', 'opening_balance_date');

-- 2. Verify audit log table:
-- SELECT table_name, table_type 
-- FROM information_schema.tables 
-- WHERE table_name = 'customer_opening_balance_history';

-- 3. Verify RLS policy:
-- SELECT tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename = 'customer_opening_balance_history';
