-- ============================================================
-- Dubai ERP — Real-World Documents & Contracting Operations Suite Migration
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================

-- 1. Extend Companies Table with Official UAE Branding Fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS arabic_name TEXT,
  ADD COLUMN IF NOT EXISTS po_box TEXT,
  ADD COLUMN IF NOT EXISTS mobile TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Extend Delivery Notes & Items for Real Dispatch Operations
ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS order_ref TEXT,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS driver_number TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'Company Vehicle',
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS receiver_mobile TEXT,
  ADD COLUMN IF NOT EXISTS receiver_signature TEXT,
  ADD COLUMN IF NOT EXISTS company_signature TEXT;

ALTER TABLE public.delivery_note_items
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Nos',
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. Extend Quotations & Invoices & Purchase Orders with Project linkage
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_mobile TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS scope_of_work TEXT,
  ADD COLUMN IF NOT EXISTS price_validity TEXT,
  ADD COLUMN IF NOT EXISTS supply_time TEXT,
  ADD COLUMN IF NOT EXISTS delivery_terms TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS terms_conditions TEXT;

ALTER TABLE public.tax_invoices
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_mobile TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS scope_of_work TEXT,
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_schedule TEXT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS vendor_reference TEXT,
  ADD COLUMN IF NOT EXISTS vendor_contact TEXT,
  ADD COLUMN IF NOT EXISTS vendor_mobile TEXT,
  ADD COLUMN IF NOT EXISTS vendor_telephone TEXT,
  ADD COLUMN IF NOT EXISTS vendor_email TEXT,
  ADD COLUMN IF NOT EXISTS vendor_trn TEXT,
  ADD COLUMN IF NOT EXISTS delivery_terms TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS terms_conditions TEXT;

-- 4. Extend Salary Statements & Employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_code TEXT,
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS account_number TEXT;

ALTER TABLE public.salary_statements
  ADD COLUMN IF NOT EXISTS housing_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absence_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS friday_pay NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payroll_year INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_voucher_id UUID;

-- 5. Create Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_number TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  location TEXT,
  main_contractor TEXT,
  subcontractor TEXT,
  status TEXT NOT NULL DEFAULT 'In Progress' CHECK (status IN ('Planning', 'In Progress', 'On Hold', 'Completed', 'Handed Over')),
  start_date DATE,
  end_date DATE,
  contract_value NUMERIC(12,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Project Manpower Schedule
CREATE TABLE IF NOT EXISTS public.project_manpower (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  daily_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_days NUMERIC(10,2) NOT NULL DEFAULT 1,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Project Equipment Schedule
CREATE TABLE IF NOT EXISTS public.project_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  rate_per_day NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_days NUMERIC(10,2) NOT NULL DEFAULT 1,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7b. Project Direct Expenses (Permits, Municipality Fees, Testing, Logistics)
CREATE TABLE IF NOT EXISTS public.project_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Permits & Government Fees',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_date DATE DEFAULT CURRENT_DATE,
  receipt_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Work Method Statements (WMS)
CREATE TABLE IF NOT EXISTS public.work_method_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wms_number TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  main_contractor TEXT,
  subcontractor TEXT,
  prepared_by TEXT,
  approved_by TEXT,
  document_date DATE DEFAULT CURRENT_DATE,
  revision TEXT NOT NULL DEFAULT 'Rev 00',
  purpose TEXT,
  scope TEXT,
  reference_documents TEXT,
  responsibilities TEXT,
  materials TEXT,
  tools_equipment TEXT,
  pre_installation TEXT,
  installation_procedure TEXT,
  quality_control TEXT,
  health_safety TEXT,
  environmental TEXT,
  acceptance_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. WMS Risk Assessment Rows
CREATE TABLE IF NOT EXISTS public.wms_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wms_id UUID NOT NULL REFERENCES public.work_method_statements(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  hazard TEXT NOT NULL,
  control_measures TEXT NOT NULL,
  risk_level TEXT DEFAULT 'Medium' CHECK (risk_level IN ('Low', 'Medium', 'High')),
  sequence_order INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. WMS QA/QC Inspection Checklist
CREATE TABLE IF NOT EXISTS public.wms_qaqc_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wms_id UUID NOT NULL REFERENCES public.work_method_statements(id) ON DELETE CASCADE,
  inspection_item TEXT NOT NULL,
  acceptance_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Pass', 'Fail', 'Hold', 'N/A')),
  remarks TEXT,
  inspector_name TEXT,
  inspection_date DATE,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Project Handover Records
CREATE TABLE IF NOT EXISTS public.project_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  handover_number TEXT NOT NULL,
  handover_date DATE NOT NULL DEFAULT CURRENT_DATE,
  scope_completed TEXT,
  snags_remarks TEXT,
  client_representative TEXT,
  contractor_representative TEXT,
  client_signed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Draft', 'Snag List Pending', 'Completed', 'Approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Receipt Vouchers Table
CREATE TABLE IF NOT EXISTS public.receipt_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  voucher_number TEXT NOT NULL,
  voucher_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  received_from TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_words TEXT,
  payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Cheque', 'Bank Transfer', 'Credit Card')),
  cheque_number TEXT,
  cheque_date DATE,
  bank_name TEXT,
  tax_invoice_id UUID REFERENCES public.tax_invoices(id) ON DELETE SET NULL,
  total_due NUMERIC(12,2) DEFAULT 0,
  advance_amount NUMERIC(12,2) DEFAULT 0,
  balance_amount NUMERIC(12,2) DEFAULT 0,
  accountant_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Employee Payment Vouchers Table
CREATE TABLE IF NOT EXISTS public.employee_payment_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  voucher_number TEXT NOT NULL,
  voucher_date DATE NOT NULL DEFAULT CURRENT_DATE,
  salary_statement_id UUID REFERENCES public.salary_statements(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  payroll_month INTEGER,
  payroll_year INTEGER,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_words TEXT,
  payment_method TEXT NOT NULL DEFAULT 'Bank Transfer' CHECK (payment_method IN ('Bank Transfer', 'Cash', 'Cheque')),
  bank_reference TEXT,
  prepared_by TEXT,
  approved_by TEXT,
  received_by_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Enable Row Level Security (RLS) on All New Tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_manpower ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_method_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_qaqc_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payment_vouchers ENABLE ROW LEVEL SECURITY;

-- 15. Create RLS Policies Scoped by Company (Owners, Admins & Authorized Members)
-- Grants full access to records if the authenticated user is either:
--   a) The registered company owner in public.companies (owner_id = auth.uid())
--   b) An authorized active member/admin of the company in public.profiles (id = auth.uid() AND active = true)

-- Ensure profiles table exists for multi-member company access
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on core identity and company tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function for reusable membership resolution across services and RPCs
-- Marked SECURITY DEFINER and STABLE for high performance caching and to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.get_auth_user_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.companies WHERE owner_id = (SELECT auth.uid())
  UNION
  SELECT company_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND (active IS NULL OR active = true) AND company_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_company_ids() TO authenticated;

-- Companies Table Policies:
-- Authorized members can SELECT company branding, TRN, address, and banking info.
-- Company owner has full control over their company record.
DROP POLICY IF EXISTS "companies_member_select" ON public.companies;
CREATE POLICY "companies_member_select" ON public.companies
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT public.get_auth_user_company_ids())
  );

DROP POLICY IF EXISTS "companies_owner_all" ON public.companies;
CREATE POLICY "companies_owner_all" ON public.companies
  FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- Profiles Table Policies: Authenticated users can read their own profile
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- 1. Projects Policy
DROP POLICY IF EXISTS "company_projects" ON public.projects;
CREATE POLICY "company_projects" ON public.projects
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 2. Project Manpower Policy
DROP POLICY IF EXISTS "company_project_manpower" ON public.project_manpower;
CREATE POLICY "company_project_manpower" ON public.project_manpower
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 3. Project Equipment Policy
DROP POLICY IF EXISTS "company_project_equipment" ON public.project_equipment;
CREATE POLICY "company_project_equipment" ON public.project_equipment
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 4. Project Direct Expenses Policy
DROP POLICY IF EXISTS "company_project_expenses" ON public.project_expenses;
CREATE POLICY "company_project_expenses" ON public.project_expenses
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 5. Work Method Statements Policy
DROP POLICY IF EXISTS "company_work_method_statements" ON public.work_method_statements;
CREATE POLICY "company_work_method_statements" ON public.work_method_statements
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 6. WMS Risk Assessments Policy
DROP POLICY IF EXISTS "company_wms_risk_assessments" ON public.wms_risk_assessments;
CREATE POLICY "company_wms_risk_assessments" ON public.wms_risk_assessments
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 7. WMS QA/QC Checklists Policy
DROP POLICY IF EXISTS "company_wms_qaqc_checklists" ON public.wms_qaqc_checklists;
CREATE POLICY "company_wms_qaqc_checklists" ON public.wms_qaqc_checklists
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 8. Project Handovers Policy
DROP POLICY IF EXISTS "company_project_handovers" ON public.project_handovers;
CREATE POLICY "company_project_handovers" ON public.project_handovers
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 9. Receipt Vouchers Policy
DROP POLICY IF EXISTS "company_receipt_vouchers" ON public.receipt_vouchers;
CREATE POLICY "company_receipt_vouchers" ON public.receipt_vouchers
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 10. Employee Payment Vouchers Policy
DROP POLICY IF EXISTS "company_employee_payment_vouchers" ON public.employee_payment_vouchers;
CREATE POLICY "company_employee_payment_vouchers" ON public.employee_payment_vouchers
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 11. Scoped Policies for Modified Existing ERP Operations Tables
DROP POLICY IF EXISTS "company_delivery_notes" ON public.delivery_notes;
CREATE POLICY "company_delivery_notes" ON public.delivery_notes
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_delivery_note_items" ON public.delivery_note_items;
CREATE POLICY "company_delivery_note_items" ON public.delivery_note_items
  FOR ALL TO authenticated
  USING (delivery_note_id IN (SELECT id FROM public.delivery_notes WHERE company_id IN (SELECT public.get_auth_user_company_ids())))
  WITH CHECK (delivery_note_id IN (SELECT id FROM public.delivery_notes WHERE company_id IN (SELECT public.get_auth_user_company_ids())));

DROP POLICY IF EXISTS "company_tax_invoices" ON public.tax_invoices;
CREATE POLICY "company_tax_invoices" ON public.tax_invoices
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_tax_invoice_items" ON public.tax_invoice_items;
CREATE POLICY "company_tax_invoice_items" ON public.tax_invoice_items
  FOR ALL TO authenticated
  USING (tax_invoice_id IN (SELECT id FROM public.tax_invoices WHERE company_id IN (SELECT public.get_auth_user_company_ids())))
  WITH CHECK (tax_invoice_id IN (SELECT id FROM public.tax_invoices WHERE company_id IN (SELECT public.get_auth_user_company_ids())));

DROP POLICY IF EXISTS "company_quotations" ON public.quotations;
CREATE POLICY "company_quotations" ON public.quotations
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_quotation_items" ON public.quotation_items;
CREATE POLICY "company_quotation_items" ON public.quotation_items
  FOR ALL TO authenticated
  USING (quotation_id IN (SELECT id FROM public.quotations WHERE company_id IN (SELECT public.get_auth_user_company_ids())))
  WITH CHECK (quotation_id IN (SELECT id FROM public.quotations WHERE company_id IN (SELECT public.get_auth_user_company_ids())));

DROP POLICY IF EXISTS "company_purchase_orders" ON public.purchase_orders;
CREATE POLICY "company_purchase_orders" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "company_purchase_order_items" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (po_id IN (SELECT id FROM public.purchase_orders WHERE company_id IN (SELECT public.get_auth_user_company_ids())))
  WITH CHECK (po_id IN (SELECT id FROM public.purchase_orders WHERE company_id IN (SELECT public.get_auth_user_company_ids())));

DROP POLICY IF EXISTS "company_employees" ON public.employees;
CREATE POLICY "company_employees" ON public.employees
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_salary_statements" ON public.salary_statements;
CREATE POLICY "company_salary_statements" ON public.salary_statements
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_customers" ON public.customers;
CREATE POLICY "company_customers" ON public.customers
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_suppliers" ON public.suppliers;
CREATE POLICY "company_suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_products" ON public.products;
CREATE POLICY "company_products" ON public.products
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_payments" ON public.payments;
CREATE POLICY "company_payments" ON public.payments
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 16. Grant Permissions to Authenticated Role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_manpower TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_equipment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_method_statements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wms_risk_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wms_qaqc_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_handovers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.receipt_vouchers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_payment_vouchers TO authenticated;

-- 17. High-Performance Foreign Key & RLS Filtering Indexes
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON public.projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_project_manpower_project_id ON public.project_manpower(project_id);
CREATE INDEX IF NOT EXISTS idx_project_equipment_project_id ON public.project_equipment(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_project_id ON public.project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_wms_project_id ON public.work_method_statements(project_id);
CREATE INDEX IF NOT EXISTS idx_wms_risks_wms_id ON public.wms_risk_assessments(wms_id);
CREATE INDEX IF NOT EXISTS idx_wms_qaqc_wms_id ON public.wms_qaqc_checklists(wms_id);
CREATE INDEX IF NOT EXISTS idx_handovers_project_id ON public.project_handovers(project_id);
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_company_id ON public.receipt_vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_company_id ON public.employee_payment_vouchers(company_id);

-- ============================================================
-- 18. Additional Tables for Complete Dubai ERP Operations
-- ============================================================

-- 18.1 Supplier Bills Table
CREATE TABLE IF NOT EXISTS public.supplier_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  supplier_invoice_ref TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Draft', 'Pending', 'Partially Paid', 'Paid', 'Cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.supplier_bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'Nos',
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- 18.2 Stock Movements & Adjustments
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER', 'RETURN')),
  quantity NUMERIC(12,3) NOT NULL,
  previous_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  new_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  reference_type TEXT,
  reference_id UUID,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  adjustment_number TEXT NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Draft', 'Completed', 'Cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recorded_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  counted_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  difference NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT
);

-- 18.3 Project Payment Milestones
CREATE TABLE IF NOT EXISTS public.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  percentage NUMERIC(5,2) DEFAULT 0,
  fixed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Invoiced', 'Paid', 'Overdue')),
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18.4 Document Attachments
CREATE TABLE IF NOT EXISTS public.document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'customer', 'supplier', 'quotation', 'invoice', 'po', 'payment', 'wms', 'qaqc', 'handover', 'bill', 'expense')),
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  description TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18.5 Expenses & Petty Cash
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expense_number TEXT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'General & Administrative',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'Petty Cash')),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  receipt_reference TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Paid' CHECK (status IN ('Pending', 'Approved', 'Paid', 'Rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.petty_cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  voucher_number TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DISBURSEMENT', 'REPLENISHMENT')),
  payee TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Office Supplies & Tea/Pantry',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  receipt_ref TEXT,
  description TEXT NOT NULL,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all section 18 tables
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;

-- Create Scoped RLS Policies
DROP POLICY IF EXISTS "company_supplier_bills" ON public.supplier_bills;
CREATE POLICY "company_supplier_bills" ON public.supplier_bills
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_supplier_bill_items" ON public.supplier_bill_items;
CREATE POLICY "company_supplier_bill_items" ON public.supplier_bill_items
  FOR ALL TO authenticated
  USING (bill_id IN (SELECT id FROM public.supplier_bills WHERE company_id IN (SELECT public.get_auth_user_company_ids())))
  WITH CHECK (bill_id IN (SELECT id FROM public.supplier_bills WHERE company_id IN (SELECT public.get_auth_user_company_ids())));

DROP POLICY IF EXISTS "company_stock_movements" ON public.stock_movements;
CREATE POLICY "company_stock_movements" ON public.stock_movements
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_stock_adjustments" ON public.stock_adjustments;
CREATE POLICY "company_stock_adjustments" ON public.stock_adjustments
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_stock_adjustment_items" ON public.stock_adjustment_items;
CREATE POLICY "company_stock_adjustment_items" ON public.stock_adjustment_items
  FOR ALL TO authenticated
  USING (adjustment_id IN (SELECT id FROM public.stock_adjustments WHERE company_id IN (SELECT public.get_auth_user_company_ids())))
  WITH CHECK (adjustment_id IN (SELECT id FROM public.stock_adjustments WHERE company_id IN (SELECT public.get_auth_user_company_ids())));

DROP POLICY IF EXISTS "company_project_milestones" ON public.project_milestones;
CREATE POLICY "company_project_milestones" ON public.project_milestones
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_document_attachments" ON public.document_attachments;
CREATE POLICY "company_document_attachments" ON public.document_attachments
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_expenses" ON public.expenses;
CREATE POLICY "company_expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

DROP POLICY IF EXISTS "company_petty_cash_transactions" ON public.petty_cash_transactions;
CREATE POLICY "company_petty_cash_transactions" ON public.petty_cash_transactions
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_bills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_bill_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_adjustment_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.petty_cash_transactions TO authenticated;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_bills_company_id ON public.supplier_bills(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier_id ON public.supplier_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_id ON public.stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id ON public.project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_document_attachments_entity ON public.document_attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON public.expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_company_id ON public.petty_cash_transactions(company_id);

-- ============================================================
-- 19. Sequential Document Numbering — next_doc_number RPC
-- ============================================================
-- Atomic, database-side numbering used by lib/helpers.ts -> generateDocNumber().
-- Format: PREFIX-YYYY-0001 (e.g. INV-2026-0001, INV-2026-0002, ...).
-- The counter is keyed per company + prefix + calendar year, so:
--   * numbering stays company-specific,
--   * the sequence increments by exactly 1 per new document,
--   * the year segment resets automatically on a year change,
--   * existing document rows are never read, rewritten, or renumbered.

CREATE TABLE IF NOT EXISTS public.document_counters (
  company_id UUID NOT NULL,
  prefix TEXT NOT NULL,
  doc_year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, doc_year)
);

-- RLS with no policies: clients cannot read/write the counter directly.
-- Only the SECURITY DEFINER function below touches it.
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

-- Ensure exactly ONE next_doc_number implementation exists (no second
-- numbering system / no argument-overload ambiguity for the RPC call).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'next_doc_number'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

CREATE FUNCTION public.next_doc_number(p_company_id UUID, p_prefix TEXT)
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

  -- Single atomic upsert: the row lock guarantees exactly one +1 per call,
  -- even when two users create documents at the same time.
  INSERT INTO public.document_counters AS dc (company_id, prefix, doc_year, last_number)
  VALUES (p_company_id, v_prefix, v_year, 1)
  ON CONFLICT (company_id, prefix, doc_year)
  DO UPDATE SET last_number = dc.last_number + 1
  RETURNING dc.last_number INTO v_next;

  -- INV-2026-0001 — 4-digit zero padding. Once the counter passes 9999 the
  -- number is printed in full instead of being passed through lpad(), which
  -- would silently truncate it (10000 -> 1000) and collide with a document
  -- number already issued earlier in the same year.
  RETURN v_prefix || '-' || v_year::TEXT || '-' ||
         CASE WHEN v_next <= 9999 THEN lpad(v_next::TEXT, 4, '0') ELSE v_next::TEXT END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_doc_number(UUID, TEXT) TO authenticated;


