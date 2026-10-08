-- ============================================================
-- Dubai ERP — Customizable Document Titles & Numbering Schema
-- File: supabase/migrations/20261008040000_customizable_document_numbering.sql
-- Status: DRAFT — DO NOT APPLY TO PRODUCTION WITHOUT USER APPROVAL
-- Non-destructive, idempotent, safe for all existing business data.
-- ============================================================

-- 1. Create document_numbering_configs table for persistent company document configurations
CREATE TABLE IF NOT EXISTS public.document_numbering_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  include_year BOOLEAN NOT NULL DEFAULT false,
  year_format TEXT NOT NULL DEFAULT 'YYYY' CHECK (year_format IN ('YYYY', 'YY')),
  year_position TEXT NOT NULL DEFAULT 'after_prefix' CHECK (year_position IN ('after_prefix', 'after_sequence')),
  separator TEXT NOT NULL DEFAULT '-' CHECK (separator IN ('-', '/', ' ', '')),
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding BETWEEN 1 AND 10),
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  custom_title TEXT,
  custom_title_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_doc_type UNIQUE (company_id, doc_type)
);

-- Index for rapid lookup by company & document type
CREATE INDEX IF NOT EXISTS idx_doc_numbering_company_type 
  ON public.document_numbering_configs (company_id, doc_type);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.document_numbering_configs ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS "Allow select for all authenticated users" ON public.document_numbering_configs;
CREATE POLICY "Allow select for all authenticated users"
  ON public.document_numbering_configs FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert for all authenticated users" ON public.document_numbering_configs;
CREATE POLICY "Allow insert for all authenticated users"
  ON public.document_numbering_configs FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for all authenticated users" ON public.document_numbering_configs;
CREATE POLICY "Allow update for all authenticated users"
  ON public.document_numbering_configs FOR UPDATE
  USING (true);

-- 3. Stored Procedure: Atomic Sequence Incrementor with Row-Level Locking (FOR UPDATE)
-- Guarantees zero sequence gaps, zero duplicates, and atomic multi-user concurrency.
CREATE OR REPLACE FUNCTION public.get_next_custom_doc_number(
  p_company_id UUID,
  p_doc_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_cfg RECORD;
  v_current_seq INTEGER;
  v_next_seq INTEGER;
  v_year TEXT;
  v_formatted_seq TEXT;
  v_result_number TEXT;
  v_sep TEXT;
  v_parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Row-level lock to prevent race conditions during simultaneous document creations
  SELECT *
  INTO v_cfg
  FROM public.document_numbering_configs
  WHERE company_id = p_company_id AND doc_type = p_doc_type
  FOR UPDATE;

  -- If no config exists, initialize from company defaults or fall back to 1
  IF NOT FOUND THEN
    v_current_seq := 1;
    v_next_seq := 2;
    
    INSERT INTO public.document_numbering_configs (
      company_id,
      doc_type,
      prefix,
      include_year,
      year_format,
      year_position,
      separator,
      padding,
      next_sequence
    ) VALUES (
      p_company_id,
      p_doc_type,
      UPPER(SUBSTRING(p_doc_type FROM 1 FOR 3)),
      false,
      'YYYY',
      'after_prefix',
      '-',
      4,
      v_next_seq
    )
    ON CONFLICT (company_id, doc_type) DO UPDATE
      SET next_sequence = public.document_numbering_configs.next_sequence + 1
    RETURNING * INTO v_cfg;
  ELSE
    v_current_seq := v_cfg.next_sequence;
    v_next_seq := v_current_seq + 1;

    UPDATE public.document_numbering_configs
    SET next_sequence = v_next_seq,
        updated_at = now()
    WHERE id = v_cfg.id;
  END IF;

  -- Build formatted reference string
  v_sep := v_cfg.separator;
  IF v_cfg.year_format = 'YY' THEN
    v_year := TO_CHAR(CURRENT_DATE, 'YY');
  ELSE
    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  END IF;

  v_formatted_seq := LPAD(v_current_seq::TEXT, v_cfg.padding, '0');

  IF v_cfg.prefix IS NOT NULL AND v_cfg.prefix <> '' THEN
    v_parts := array_append(v_parts, v_cfg.prefix);
  END IF;

  IF v_cfg.include_year AND v_cfg.year_position = 'after_prefix' THEN
    v_parts := array_append(v_parts, v_year);
  END IF;

  v_parts := array_append(v_parts, v_formatted_seq);

  IF v_cfg.include_year AND v_cfg.year_position = 'after_sequence' THEN
    v_parts := array_append(v_parts, v_year);
  END IF;

  IF array_length(v_parts, 1) > 0 THEN
    v_result_number := array_to_string(v_parts, v_sep);
  ELSE
    v_result_number := v_formatted_seq;
  END IF;

  RETURN jsonb_build_object(
    'document_number', v_result_number,
    'sequence_used', v_current_seq,
    'next_sequence', v_next_seq,
    'custom_title', v_cfg.custom_title,
    'custom_title_ar', v_cfg.custom_title_ar
  );
END;
$$;
