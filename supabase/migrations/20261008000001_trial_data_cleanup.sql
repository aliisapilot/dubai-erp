-- =============================================================================
-- Dubai ERP: Trial Data Cleanup Infrastructure
-- Admin audit log, dry-run RPC and transactional cleanup RPC
-- Idempotent, non-destructive. Do not apply to live project without review.
-- =============================================================================

-- 1. Admin audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  action_details JSONB NOT NULL DEFAULT '{}',
  record_counts JSONB NOT NULL DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmation_token TEXT,
  is_dry_run BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_company_id ON public.admin_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_executed_at ON public.admin_audit_log(executed_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_log_select_owner" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_select_owner" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = admin_audit_log.company_id
        AND c.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_audit_log_insert_owner" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_insert_owner" ON public.admin_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = admin_audit_log.company_id
        AND c.owner_id = auth.uid()
    )
  );

-- 2. Dry-run RPC
CREATE OR REPLACE FUNCTION public.trial_data_cleanup_dry_run(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  result JSONB := '{}';
  cnt INT;
BEGIN
  SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;
  IF v_owner_id IS NULL OR v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COUNT(*) INTO cnt FROM public.measurement_items mi
  JOIN public.measurement_projects mp ON mp.id = mi.sheet_id
  WHERE mp.company_id = p_company_id;
  result := jsonb_set(result, '{measurement_items}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.quotation_items qi
  JOIN public.quotations q ON q.id = qi.quotation_id
  WHERE q.company_id = p_company_id;
  result := jsonb_set(result, '{quotation_items}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.tax_invoice_items ti
  JOIN public.tax_invoices t ON t.id = ti.tax_invoice_id
  WHERE t.company_id = p_company_id;
  result := jsonb_set(result, '{tax_invoice_items}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.delivery_note_items dni
  JOIN public.delivery_notes dn ON dn.id = dni.delivery_note_id
  WHERE dn.company_id = p_company_id;
  result := jsonb_set(result, '{delivery_note_items}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE po.company_id = p_company_id;
  result := jsonb_set(result, '{purchase_order_items}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.supplier_bill_items sbi
  JOIN public.supplier_bills sb ON sb.id = sbi.bill_id
  WHERE sb.company_id = p_company_id;
  result := jsonb_set(result, '{supplier_bill_items}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.cheque_status_history csh
  JOIN public.cheques c ON c.id = csh.cheque_id
  WHERE c.company_id = p_company_id;
  result := jsonb_set(result, '{cheque_status_history}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.proforma_invoice_items pii
  JOIN public.proforma_invoices pi ON pi.id = pii.proforma_invoice_id
  WHERE pi.company_id = p_company_id;
  result := jsonb_set(result, '{proforma_invoice_items}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.quotations WHERE company_id = p_company_id;
  result := jsonb_set(result, '{quotations}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.tax_invoices WHERE company_id = p_company_id;
  result := jsonb_set(result, '{tax_invoices}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.delivery_notes WHERE company_id = p_company_id;
  result := jsonb_set(result, '{delivery_notes}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.purchase_orders WHERE company_id = p_company_id;
  result := jsonb_set(result, '{purchase_orders}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.supplier_bills WHERE company_id = p_company_id;
  result := jsonb_set(result, '{supplier_bills}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.expenses WHERE company_id = p_company_id;
  result := jsonb_set(result, '{expenses}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.payments WHERE company_id = p_company_id;
  result := jsonb_set(result, '{payments}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.petty_cash_transactions WHERE company_id = p_company_id;
  result := jsonb_set(result, '{petty_cash_transactions}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.receipt_vouchers WHERE company_id = p_company_id;
  result := jsonb_set(result, '{receipt_vouchers}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.employee_payment_vouchers WHERE company_id = p_company_id;
  result := jsonb_set(result, '{employee_payment_vouchers}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.cheques WHERE company_id = p_company_id;
  result := jsonb_set(result, '{cheques}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.measurement_projects WHERE company_id = p_company_id;
  result := jsonb_set(result, '{measurement_projects}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.proforma_invoices WHERE company_id = p_company_id;
  result := jsonb_set(result, '{proforma_invoices}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.projects WHERE company_id = p_company_id;
  result := jsonb_set(result, '{projects}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.customers WHERE company_id = p_company_id;
  result := jsonb_set(result, '{customers_preserved}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.suppliers WHERE company_id = p_company_id;
  result := jsonb_set(result, '{suppliers_preserved}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.employees WHERE company_id = p_company_id;
  result := jsonb_set(result, '{employees_preserved}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.products WHERE company_id = p_company_id;
  result := jsonb_set(result, '{products_preserved}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.document_access_logs WHERE company_id = p_company_id;
  result := jsonb_set(result, '{document_access_logs_preserved}', to_jsonb(cnt));

  SELECT COUNT(*) INTO cnt FROM public.stock_movements WHERE company_id = p_company_id;
  result := jsonb_set(result, '{stock_movements_preserved}', to_jsonb(cnt));

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.trial_data_cleanup_dry_run(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trial_data_cleanup_dry_run(UUID) TO authenticated;

-- 3. Transactional cleanup RPC
CREATE OR REPLACE FUNCTION public.trial_data_cleanup_execute(p_company_id UUID, p_confirmation_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  deleted JSONB := '{}';
  cnt INT;
BEGIN
  SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = p_company_id;
  IF v_owner_id IS NULL OR v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_confirmation_token IS NULL OR p_confirmation_token <> 'DELETE 4dbb309a-f31c-4615-8bb5-59df7a6326e3' THEN
    RAISE EXCEPTION 'Invalid confirmation token';
  END IF;

  IF p_company_id <> '4dbb309a-f31c-4615-8bb5-59df7a6326e3'::UUID THEN
    RAISE EXCEPTION 'Company mismatch';
  END IF;

  DELETE FROM public.measurement_items WHERE sheet_id IN (
    SELECT id FROM public.measurement_projects WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{measurement_items}', to_jsonb(cnt));

  DELETE FROM public.quotation_items WHERE quotation_id IN (
    SELECT id FROM public.quotations WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{quotation_items}', to_jsonb(cnt));

  DELETE FROM public.tax_invoice_items WHERE tax_invoice_id IN (
    SELECT id FROM public.tax_invoices WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{tax_invoice_items}', to_jsonb(cnt));

  DELETE FROM public.delivery_note_items WHERE delivery_note_id IN (
    SELECT id FROM public.delivery_notes WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{delivery_note_items}', to_jsonb(cnt));

  DELETE FROM public.purchase_order_items WHERE purchase_order_id IN (
    SELECT id FROM public.purchase_orders WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{purchase_order_items}', to_jsonb(cnt));

  DELETE FROM public.supplier_bill_items WHERE bill_id IN (
    SELECT id FROM public.supplier_bills WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{supplier_bill_items}', to_jsonb(cnt));

  DELETE FROM public.cheque_status_history WHERE cheque_id IN (
    SELECT id FROM public.cheques WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{cheque_status_history}', to_jsonb(cnt));

  DELETE FROM public.proforma_invoice_items WHERE proforma_invoice_id IN (
    SELECT id FROM public.proforma_invoices WHERE company_id = p_company_id
  );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{proforma_invoice_items}', to_jsonb(cnt));

  DELETE FROM public.quotations WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{quotations}', to_jsonb(cnt));

  DELETE FROM public.tax_invoices WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{tax_invoices}', to_jsonb(cnt));

  DELETE FROM public.delivery_notes WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{delivery_notes}', to_jsonb(cnt));

  DELETE FROM public.purchase_orders WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{purchase_orders}', to_jsonb(cnt));

  DELETE FROM public.supplier_bills WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{supplier_bills}', to_jsonb(cnt));

  DELETE FROM public.expenses WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{expenses}', to_jsonb(cnt));

  DELETE FROM public.payments WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{payments}', to_jsonb(cnt));

  DELETE FROM public.petty_cash_transactions WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{petty_cash_transactions}', to_jsonb(cnt));

  DELETE FROM public.receipt_vouchers WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{receipt_vouchers}', to_jsonb(cnt));

  DELETE FROM public.employee_payment_vouchers WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{employee_payment_vouchers}', to_jsonb(cnt));

  DELETE FROM public.cheques WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{cheques}', to_jsonb(cnt));

  DELETE FROM public.measurement_projects WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{measurement_projects}', to_jsonb(cnt));

  DELETE FROM public.proforma_invoices WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{proforma_invoices}', to_jsonb(cnt));

  DELETE FROM public.projects WHERE company_id = p_company_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted := jsonb_set(deleted, '{projects}', to_jsonb(cnt));

  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.trial_data_cleanup_execute(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trial_data_cleanup_execute(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


