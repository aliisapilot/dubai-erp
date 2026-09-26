-- ==============================================================================
-- Dubai ERP: Cheque Management & Automatic Reminders Migration
-- File: supabase/migrations/20260927000000_cheque_management.sql
-- Idempotent, non-destructive, safe for all existing business data.
-- ==============================================================================

-- 1. Main Cheques Table
CREATE TABLE IF NOT EXISTS public.cheques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cheque_type TEXT NOT NULL CHECK (cheque_type IN ('incoming', 'outgoing')),
  cheque_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  
  -- Counterparty association
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  payee_name TEXT,
  
  -- Document linkages
  tax_invoice_id UUID REFERENCES public.tax_invoices(id) ON DELETE SET NULL,
  supplier_bill_id UUID REFERENCES public.supplier_bills(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  is_payment_recorded BOOLEAN NOT NULL DEFAULT false,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deposited', 'cleared', 'bounced', 'cancelled')),
  deposit_date DATE,
  deposit_bank_account TEXT,
  clearance_date DATE,
  clearance_reference TEXT,
  bounce_date DATE,
  bounce_reason TEXT,
  cancellation_date DATE,
  cancellation_reason TEXT,

  -- Responsible employee & notes
  responsible_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  responsible_employee_name TEXT,
  notes TEXT,

  -- Supporting documents & storage paths
  cheque_image_front_url TEXT,
  cheque_image_back_url TEXT,
  deposit_slip_url TEXT,
  bounce_slip_url TEXT,

  -- Audit & tracking
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning-fast queries and reporting
CREATE INDEX IF NOT EXISTS idx_cheques_company_due_date ON public.cheques(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_company_status ON public.cheques(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cheques_type_status ON public.cheques(company_id, cheque_type, status);
CREATE INDEX IF NOT EXISTS idx_cheques_customer ON public.cheques(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cheques_supplier ON public.cheques(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cheques_tax_invoice ON public.cheques(tax_invoice_id) WHERE tax_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cheques_supplier_bill ON public.cheques(supplier_bill_id) WHERE supplier_bill_id IS NOT NULL;

-- 2. Cheque Status History / Audit Trail Table
CREATE TABLE IF NOT EXISTS public.cheque_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cheque_id UUID NOT NULL REFERENCES public.cheques(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  action_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_by_name TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheque_history_cheque_id ON public.cheque_status_history(cheque_id);

-- 3. Cheque Reminders & Deduplication Table
CREATE TABLE IF NOT EXISTS public.cheque_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cheque_id UUID NOT NULL REFERENCES public.cheques(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('7_days_before', '3_days_before', '1_day_before', 'due_today', 'overdue')),
  due_date DATE NOT NULL,
  recipient_email TEXT,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'both')),
  notification_title TEXT NOT NULL,
  notification_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read', 'dismissed')),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  delivery_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Critical deduplication constraint:
  -- Guarantees a reminder for a given stage is never triggered more than once for the same due date
  CONSTRAINT uq_cheque_reminder_dedup UNIQUE (cheque_id, reminder_type, due_date)
);

CREATE INDEX IF NOT EXISTS idx_cheque_reminders_company_status ON public.cheque_reminders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cheque_reminders_cheque ON public.cheque_reminders(cheque_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_reminders ENABLE ROW LEVEL SECURITY;

-- 5. Multi-Company RLS Policies (Aligned with get_auth_user_company_ids)
DROP POLICY IF EXISTS "cheques_company_isolation" ON public.cheques;
CREATE POLICY "cheques_company_isolation" ON public.cheques
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "cheque_history_company_isolation" ON public.cheque_status_history;
CREATE POLICY "cheque_history_company_isolation" ON public.cheque_status_history
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "cheque_reminders_company_isolation" ON public.cheque_reminders;
CREATE POLICY "cheque_reminders_company_isolation" ON public.cheque_reminders
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 6. Storage Bucket Configuration (Private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cheques', 'cheques', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Authenticated users can upload and view
DROP POLICY IF EXISTS "cheques_storage_authenticated_select" ON storage.objects;
CREATE POLICY "cheques_storage_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cheques');

DROP POLICY IF EXISTS "cheques_storage_authenticated_insert" ON storage.objects;
CREATE POLICY "cheques_storage_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cheques');

-- 7. Grant Table Permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cheques TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cheque_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cheque_reminders TO authenticated;

-- 8. PostgREST Schema Cache Reload
NOTIFY pgrst, 'reload schema';
