-- Migration: 20261108150000_record_customer_payment_rpc.sql
-- Description: Transactional PostgreSQL RPC for customer payment recording and invoice allocation
-- Ensures ACID atomicity for receipt voucher creation and tax invoice allocation.

CREATE OR REPLACE FUNCTION public.record_customer_payment_v1(
  p_company_id UUID,
  p_customer_id UUID,
  p_received_from TEXT,
  p_amount NUMERIC,
  p_voucher_number TEXT,
  p_voucher_date DATE,
  p_payment_method TEXT,
  p_tax_invoice_id UUID DEFAULT NULL,
  p_cheque_number TEXT DEFAULT NULL,
  p_cheque_date DATE DEFAULT NULL,
  p_bank_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_amount_words TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipt_id UUID;
  v_invoice_total NUMERIC;
  v_invoice_status TEXT;
  v_total_paid NUMERIC;
  v_new_inv_status TEXT;
  v_clean_amt NUMERIC;
  v_clean_voucher_no TEXT;
  v_clean_received_from TEXT;
BEGIN
  -- 1. Validate inputs
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Company ID is required.';
  END IF;

  v_clean_amt := round(COALESCE(p_amount, 0), 2);
  IF v_clean_amt <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  v_clean_voucher_no := trim(COALESCE(p_voucher_number, ''));
  IF v_clean_voucher_no = '' THEN
    RAISE EXCEPTION 'Receipt voucher number is required.';
  END IF;

  v_clean_received_from := trim(COALESCE(p_received_from, ''));
  IF v_clean_received_from = '' THEN
    RAISE EXCEPTION 'Received From customer name is required and cannot be empty.';
  END IF;

  -- 2. Validate Payment Method constraint
  IF p_payment_method NOT IN ('Cash', 'Cheque', 'Bank Transfer', 'Credit Card') THEN
    RAISE EXCEPTION 'Invalid payment method: %. Allowed: Cash, Cheque, Bank Transfer, Credit Card', p_payment_method;
  END IF;

  -- 3. Check for voucher number collision within the active company
  IF EXISTS (
    SELECT 1 FROM public.receipt_vouchers
    WHERE company_id = p_company_id
      AND lower(voucher_number) = lower(v_clean_voucher_no)
  ) THEN
    RAISE EXCEPTION 'Voucher number % already exists in this company.', v_clean_voucher_no;
  END IF;

  -- 4. If linking to an invoice, lock the invoice row and verify company ownership
  IF p_tax_invoice_id IS NOT NULL THEN
    SELECT total_amount, status
    INTO v_invoice_total, v_invoice_status
    FROM public.tax_invoices
    WHERE id = p_tax_invoice_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tax invoice % not found or does not belong to the selected company.', p_tax_invoice_id;
    END IF;

    IF lower(COALESCE(v_invoice_status, '')) IN ('cancelled', 'void') THEN
      RAISE EXCEPTION 'Cannot allocate payment to a cancelled or void invoice.';
    END IF;
  END IF;

  -- 5. Insert Receipt Voucher record
  INSERT INTO public.receipt_vouchers (
    company_id,
    customer_id,
    received_from,
    voucher_number,
    voucher_date,
    amount,
    amount_words,
    payment_method,
    tax_invoice_id,
    cheque_number,
    cheque_date,
    bank_name,
    notes,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_company_id,
    p_customer_id,
    v_clean_received_from,
    v_clean_voucher_no,
    COALESCE(p_voucher_date, CURRENT_DATE),
    v_clean_amt,
    p_amount_words,
    p_payment_method,
    p_tax_invoice_id,
    p_cheque_number,
    p_cheque_date,
    p_bank_name,
    p_notes,
    'posted',
    now(),
    now()
  )
  RETURNING id INTO v_receipt_id;

  -- 6. Atomically update linked Tax Invoice status and paid balance if applicable
  IF p_tax_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM public.receipt_vouchers
    WHERE tax_invoice_id = p_tax_invoice_id
      AND lower(COALESCE(status, 'posted')) NOT IN ('cancelled', 'void', 'draft');

    IF v_total_paid >= COALESCE(v_invoice_total, 0) THEN
      v_new_inv_status := 'paid';
    ELSIF v_total_paid > 0 THEN
      v_new_inv_status := 'partially_paid';
    ELSE
      v_new_inv_status := 'issued';
    END IF;

    UPDATE public.tax_invoices
    SET status = v_new_inv_status,
        updated_at = now()
    WHERE id = p_tax_invoice_id;
  END IF;

  -- 7. Return atomic execution result
  RETURN jsonb_build_object(
    'success', true,
    'receipt_id', v_receipt_id,
    'voucher_number', v_clean_voucher_no,
    'amount', v_clean_amt,
    'received_from', v_clean_received_from,
    'invoice_status', v_new_inv_status
  );
END;
$$;
