-- ============================================================
-- Dubai ERP — Custom Customer Direct to All PDF Documents
-- File: supabase/migrations/20261028000000_custom_customer_direct_pdf.sql
-- Safe, additive, non-destructive migration.
-- Preserves all historical records, existing customer relationships, and saved layouts.
-- ============================================================

-- 1. Quotations
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS customer_trn TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS custom_project_name TEXT,
  ADD COLUMN IF NOT EXISTS is_custom_customer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_customer JSONB;

ALTER TABLE public.quotations ALTER COLUMN customer_id DROP NOT NULL;

-- 2. Proforma Invoices
ALTER TABLE public.proforma_invoices
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS customer_trn TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS custom_project_name TEXT,
  ADD COLUMN IF NOT EXISTS is_custom_customer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_customer JSONB;

ALTER TABLE public.proforma_invoices ALTER COLUMN customer_id DROP NOT NULL;

-- 3. Tax Invoices
ALTER TABLE public.tax_invoices
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS customer_trn TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS custom_project_name TEXT,
  ADD COLUMN IF NOT EXISTS is_custom_customer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_customer JSONB;

ALTER TABLE public.tax_invoices ALTER COLUMN customer_id DROP NOT NULL;

-- 4. Delivery Notes
ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS customer_trn TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS custom_project_name TEXT,
  ADD COLUMN IF NOT EXISTS is_custom_customer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_customer JSONB;

ALTER TABLE public.delivery_notes ALTER COLUMN customer_id DROP NOT NULL;

-- 5. Receipt Vouchers
ALTER TABLE public.receipt_vouchers
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS customer_trn TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS custom_project_name TEXT,
  ADD COLUMN IF NOT EXISTS is_custom_customer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_customer JSONB;

ALTER TABLE public.receipt_vouchers ALTER COLUMN customer_id DROP NOT NULL;

-- 6. Purchase Orders (Custom Supplier)
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS supplier_address TEXT,
  ADD COLUMN IF NOT EXISTS supplier_trn TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS custom_project_name TEXT,
  ADD COLUMN IF NOT EXISTS is_custom_supplier BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_supplier JSONB;

ALTER TABLE public.purchase_orders ALTER COLUMN supplier_id DROP NOT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
