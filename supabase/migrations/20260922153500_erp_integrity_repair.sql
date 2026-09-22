-- ============================================================
-- Dubai ERP — Master Integrity & Schema Repair Migration
-- File: supabase/migrations/20260922153500_erp_integrity_repair.sql
-- Idempotent, non-destructive, safe for all existing business data.
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- ============================================================

-- 1. Extend Companies with UAE Branding & Settings Columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS arabic_name TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS po_box TEXT,
  ADD COLUMN IF NOT EXISTS mobile TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS stamp_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS background_url TEXT,
  ADD COLUMN IF NOT EXISTS building_image_url TEXT,
  ADD COLUMN IF NOT EXISTS footer_image_url TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS logo_size INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS arabic_name_size INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS brand_primary TEXT DEFAULT '#0F172A',
  ADD COLUMN IF NOT EXISTS brand_accent TEXT DEFAULT '#C9A227',
  ADD COLUMN IF NOT EXISTS brand_text TEXT DEFAULT '#334155',
  ADD COLUMN IF NOT EXISTS brand_muted TEXT DEFAULT '#64748B',
  ADD COLUMN IF NOT EXISTS brand_border TEXT DEFAULT '#CBD5E1',
  ADD COLUMN IF NOT EXISTS brand_table_header TEXT DEFAULT '#0F172A',
  ADD COLUMN IF NOT EXISTS brand_total_highlight TEXT DEFAULT '#F8F6ED';

-- 2. Extend Employees Table and Fix Status Constraint
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_code TEXT,
  ADD COLUMN IF NOT EXISTS employee_number TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS basic_salary NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Bank Transfer',
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure employees_status_check accepts both canonical lowercase and legacy UI values
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_status_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_status_check
  CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated', 'Active', 'Inactive', 'On Leave', 'Terminated'));

-- 3. Extend Receipt Vouchers Table and Fix Status Constraint
ALTER TABLE public.receipt_vouchers
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.receipt_vouchers DROP CONSTRAINT IF EXISTS receipt_vouchers_status_check;
ALTER TABLE public.receipt_vouchers ADD CONSTRAINT receipt_vouchers_status_check
  CHECK (status IN ('draft', 'posted', 'cancelled', 'Draft', 'Posted', 'Cancelled'));

-- 4. Extend Payments Table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 5. Extend Supplier Bills Table and Reconcile Column Names
ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Sync purchase_order_id and po_id if one is set and the other is null
UPDATE public.supplier_bills SET purchase_order_id = po_id WHERE purchase_order_id IS NULL AND po_id IS NOT NULL;
UPDATE public.supplier_bills SET po_id = purchase_order_id WHERE po_id IS NULL AND purchase_order_id IS NOT NULL;

ALTER TABLE public.supplier_bills DROP CONSTRAINT IF EXISTS supplier_bills_status_check;
ALTER TABLE public.supplier_bills ADD CONSTRAINT supplier_bills_status_check
  CHECK (status IN ('Draft', 'Pending', 'Partially Paid', 'Paid', 'Cancelled', 'draft', 'pending', 'partially_paid', 'paid', 'cancelled'));

-- 6. Extend Proforma Invoices Table
ALTER TABLE public.proforma_invoices
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terms_conditions TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.proforma_invoices DROP CONSTRAINT IF EXISTS proforma_invoices_status_check;
ALTER TABLE public.proforma_invoices ADD CONSTRAINT proforma_invoices_status_check
  CHECK (status IN ('draft', 'sent', 'accepted', 'invoiced', 'cancelled', 'Draft', 'Sent', 'Accepted', 'Invoiced', 'Cancelled'));

-- 7. Ensure Robust Status Constraints on Quotations, Invoices, Delivery Notes, Purchase Orders
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_status_check
  CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'));

ALTER TABLE public.tax_invoices DROP CONSTRAINT IF EXISTS tax_invoices_status_check;
ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_status_check
  CHECK (status IN ('draft', 'issued', 'overdue', 'paid', 'partially_paid', 'cancelled', 'Draft', 'Final', 'Issued', 'Overdue', 'Paid', 'Partially Paid', 'Cancelled'));

ALTER TABLE public.delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_status_check;
ALTER TABLE public.delivery_notes ADD CONSTRAINT delivery_notes_status_check
  CHECK (status IN ('draft', 'dispatched', 'delivered', 'cancelled', 'Draft', 'Dispatched', 'Delivered', 'Cancelled'));

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'sent', 'approved', 'received', 'cancelled', 'Draft', 'Sent', 'Approved', 'Received', 'Cancelled'));

-- 8. Document Counters Table & Next Document Number Function
CREATE TABLE IF NOT EXISTS public.document_counters (
  company_id UUID NOT NULL,
  prefix TEXT NOT NULL,
  doc_year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, doc_year)
);

ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_doc_number(p_company_id UUID, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_prefix TEXT := upper(trim(p_prefix));
  v_next INTEGER;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'next_doc_number: company id is required';
  END IF;
  IF v_prefix IS NULL OR v_prefix = '' THEN
    RAISE EXCEPTION 'next_doc_number: prefix is required';
  END IF;

  INSERT INTO public.document_counters AS dc (company_id, prefix, doc_year, last_number)
  VALUES (p_company_id, v_prefix, v_year, 1)
  ON CONFLICT (company_id, prefix, doc_year)
  DO UPDATE SET last_number = dc.last_number + 1
  RETURNING dc.last_number INTO v_next;

  RETURN v_prefix || '-' || v_year::TEXT || '-' ||
         CASE WHEN v_next <= 9999 THEN lpad(v_next::TEXT, 4, '0') ELSE v_next::TEXT END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_doc_number(UUID, TEXT) TO authenticated;

-- 9. Resilient Multi-Member Company Access Function for RLS
CREATE OR REPLACE FUNCTION public.get_auth_user_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.companies WHERE owner_id = (SELECT auth.uid())
  UNION
  SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND (active IS NULL OR active = true) AND company_id IS NOT NULL
  UNION
  -- Fallback to default company when authenticated user is not explicitly linked yet
  SELECT id FROM public.companies WHERE NOT EXISTS (
    SELECT 1 FROM public.companies WHERE owner_id = (SELECT auth.uid())
    UNION
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND company_id IS NOT NULL
  ) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_company_ids() TO authenticated;

-- 10. Grant Comprehensive Permissions to Authenticated Role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tax_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tax_invoice_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quotation_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proforma_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proforma_invoice_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_note_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.receipt_vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.salary_statements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_payment_vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_manpower TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_equipment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_method_statements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wms_risk_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wms_qaqc_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_handovers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_bills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_bill_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_adjustment_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.petty_cash_transactions TO authenticated;

-- 11. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
