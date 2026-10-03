-- Additive repair: existing sheets and items are untouched by this migration.
BEGIN;
ALTER TABLE public.work_method_statements ADD COLUMN IF NOT EXISTS revision_history jsonb;
CREATE OR REPLACE FUNCTION public.save_measurement_rows(p_company_id uuid, p_sheet_id uuid, p_expected_updated_at timestamptz, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE saved_sheet public.measurement_projects; new_version timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id=p_company_id AND owner_id=auth.uid()
    UNION ALL SELECT 1 FROM public.profiles WHERE id=auth.uid() AND company_id=p_company_id AND coalesce(active,true)
  ) THEN RAISE EXCEPTION 'Not authorized for this company' USING ERRCODE='42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Measurement rows must be an array'; END IF;
  SELECT * INTO saved_sheet FROM public.measurement_projects WHERE id=p_sheet_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sheet not found or inaccessible' USING ERRCODE='42501'; END IF;
  IF p_expected_updated_at IS NULL OR saved_sheet.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This sheet changed on another device. Reload before saving.' USING ERRCODE='40001';
  END IF;
  -- These row replacements run only when the user saves, within one transaction.
  -- Any validation/insert failure rolls back the delete and preserves the previous rows.
  DELETE FROM public.measurement_items WHERE sheet_id=p_sheet_id AND company_id=p_company_id;
  INSERT INTO public.measurement_items(sheet_id,company_id,area_name,description,calc_type,dim_unit,length_entered,width_entered,width2_entered,is_variable_width,length_m,width_m,width2_m,quantity,pvc_length_edges,pvc_width_edges,pvc_centre_joints,custom_components,formula_text,per_piece_result,calculated_total,result_unit,rate,total_cost,notes,sort_order)
  SELECT p_sheet_id,p_company_id,r.area_name,r.description,r.calc_type,r.dim_unit,r.length_entered,r.width_entered,r.width2_entered,r.is_variable_width,r.length_m,r.width_m,r.width2_m,r.quantity,r.pvc_length_edges,r.pvc_width_edges,r.pvc_centre_joints,r.custom_components,r.formula_text,r.per_piece_result,r.calculated_total,r.result_unit,r.rate,r.total_cost,r.notes,r.sort_order
  FROM jsonb_populate_recordset(NULL::public.measurement_items,p_rows) r;
  new_version=clock_timestamp();
  UPDATE public.measurement_projects SET updated_at=new_version WHERE id=p_sheet_id AND company_id=p_company_id;
  RETURN jsonb_build_object('updated_at',new_version,'row_count',jsonb_array_length(p_rows));
END $$;
REVOKE ALL ON FUNCTION public.save_measurement_rows(uuid,uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_measurement_rows(uuid,uuid,timestamptz,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
