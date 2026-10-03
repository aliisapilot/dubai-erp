-- Creates the quotation header and all measured line items in one transaction.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_measurement_quotation(p_company_id uuid, p_id uuid, p_header jsonb, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE existing public.quotations; h public.quotations;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.companies WHERE id=p_company_id AND owner_id=auth.uid()
 UNION ALL SELECT 1 FROM public.profiles WHERE id=auth.uid() AND company_id=p_company_id AND coalesce(active,true)
 ) THEN RAISE EXCEPTION 'Not authorized for this company' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Quotation requires measured line items'; END IF;
 h=jsonb_populate_record(NULL::public.quotations,p_header);
 IF h.customer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=h.customer_id AND company_id=p_company_id) THEN RAISE EXCEPTION 'Select a customer in this company'; END IF;
 IF h.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=h.project_id AND company_id=p_company_id) THEN RAISE EXCEPTION 'Project belongs to another company'; END IF;
 -- A stable client ID makes retrying a lost response idempotent.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO existing FROM public.quotations WHERE id=p_id;
 IF FOUND THEN
  IF existing.company_id IS DISTINCT FROM p_company_id OR existing.quotation_number IS DISTINCT FROM h.quotation_number THEN RAISE EXCEPTION 'Quotation identity conflict'; END IF;
  RETURN p_id;
 END IF;
 INSERT INTO public.quotations(id,company_id,quotation_number,customer_id,project_id,quotation_date,expiry_date,status,subtotal,discount_amount,vat_amount,total_amount,notes)
 VALUES(p_id,p_company_id,h.quotation_number,h.customer_id,h.project_id,h.quotation_date,h.expiry_date,'draft',h.subtotal,h.discount_amount,h.vat_amount,h.total_amount,h.notes);
 INSERT INTO public.quotation_items(quotation_id,description,quantity,unit,unit_price,discount_percent,discount_amount,taxable_amount,vat_rate,vat_amount,line_total,sort_order)
 SELECT p_id,r.description,r.quantity,r.unit,r.unit_price,r.discount_percent,r.discount_amount,r.taxable_amount,r.vat_rate,r.vat_amount,r.line_total,r.sort_order
 FROM jsonb_populate_recordset(NULL::public.quotation_items,p_items) r;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.create_measurement_quotation(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_measurement_quotation(uuid,uuid,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
