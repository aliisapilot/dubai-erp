-- Repair the existing PDF Designer persistence table in place.
-- Safe to run repeatedly. Does not delete layouts or invent missing layout JSON.
-- Apply through Supabase SQL Editor after confirming the target project, or track
-- through the repository's normal migration workflow. Reapplication is idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  template_name TEXT NOT NULL DEFAULT 'Default Template',
  layout_json JSONB NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add only absent columns when an older or partially created table already exists.
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS company_id UUID,
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS layout_json JSONB,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Fail safely rather than silently coercing a pre-existing incompatible column.
DO $$
DECLARE
  expected RECORD;
  actual_type TEXT;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('id', 'uuid'),
      ('company_id', 'uuid'),
      ('document_type', 'text'),
      ('template_name', 'text'),
      ('layout_json', 'jsonb'),
      ('is_default', 'bool'),
      ('created_at', 'timestamptz'),
      ('updated_at', 'timestamptz')
    ) AS required(column_name, udt_name)
  LOOP
    SELECT c.udt_name INTO actual_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'document_templates'
      AND c.column_name = expected.column_name;

    IF actual_type IS DISTINCT FROM expected.udt_name THEN
      RAISE EXCEPTION
        'public.document_templates column % has type %, expected %. No automatic type conversion was attempted.',
        expected.column_name, actual_type, expected.udt_name;
    END IF;
  END LOOP;
END $$;

-- Recover only metadata that can be safely derived from the saved layout or row id.
UPDATE public.document_templates
SET id = gen_random_uuid()
WHERE id IS NULL;

UPDATE public.document_templates
SET document_type = NULLIF(layout_json ->> 'documentType', '')
WHERE (document_type IS NULL OR btrim(document_type) = '')
  AND jsonb_typeof(layout_json) = 'object';

UPDATE public.document_templates
SET template_name = 'Recovered style ' || left(id::TEXT, 8)
WHERE template_name IS NULL OR btrim(template_name) = '';

UPDATE public.document_templates
SET is_default = FALSE
WHERE is_default IS NULL;

UPDATE public.document_templates
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.document_templates
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

-- Layout or document type cannot be reconstructed safely; stop and preserve the rows for review.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_templates
    WHERE document_type IS NULL OR btrim(document_type) = ''
  ) THEN
    RAISE EXCEPTION
      'Some document_templates rows have no document_type and no layout_json.documentType. Map those existing rows before rerunning; no rows were deleted.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_templates
    WHERE layout_json IS NULL OR jsonb_typeof(layout_json) <> 'object'
  ) THEN
    RAISE EXCEPTION
      'Some document_templates rows have no object-valued layout_json. Restore or review those existing layouts before rerunning; no rows were deleted.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_templates
    WHERE id IS NULL OR template_name IS NULL OR created_at IS NULL OR updated_at IS NULL OR is_default IS NULL
  ) THEN
    RAISE EXCEPTION 'Required document_templates metadata could not be repaired safely; no rows were deleted.';
  END IF;
END $$;

ALTER TABLE public.document_templates
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN document_type SET NOT NULL,
  ALTER COLUMN template_name SET DEFAULT 'Default Template',
  ALTER COLUMN template_name SET NOT NULL,
  ALTER COLUMN layout_json SET NOT NULL,
  ALTER COLUMN is_default SET DEFAULT TRUE,
  ALTER COLUMN is_default SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Ensure a stable id key without replacing any existing primary key.
DO $$
DECLARE
  id_attnum SMALLINT;
  has_primary_key BOOLEAN;
  id_is_primary BOOLEAN;
BEGIN
  SELECT a.attnum INTO id_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'public.document_templates'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF EXISTS (
    SELECT id FROM public.document_templates GROUP BY id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate document_templates.id values exist; review them before adding the id key.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.document_templates'::regclass
      AND c.contype = 'p'
  ) INTO has_primary_key;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.document_templates'::regclass
      AND c.contype = 'p'
      AND c.conkey = ARRAY[id_attnum]::SMALLINT[]
  ) INTO id_is_primary;

  IF NOT has_primary_key THEN
    ALTER TABLE public.document_templates
      ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);
  ELSIF NOT id_is_primary THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_id_unique
      ON public.document_templates (id);
  END IF;
END $$;

-- The application upserts by this key. Do not discard or merge duplicate saved layouts.
DO $$
DECLARE
  company_attnum SMALLINT;
  document_type_attnum SMALLINT;
  template_name_attnum SMALLINT;
  expected_key SMALLINT[];
BEGIN
  SELECT attnum INTO company_attnum FROM pg_attribute
  WHERE attrelid = 'public.document_templates'::regclass
    AND attname = 'company_id' AND NOT attisdropped;
  SELECT attnum INTO document_type_attnum FROM pg_attribute
  WHERE attrelid = 'public.document_templates'::regclass
    AND attname = 'document_type' AND NOT attisdropped;
  SELECT attnum INTO template_name_attnum FROM pg_attribute
  WHERE attrelid = 'public.document_templates'::regclass
    AND attname = 'template_name' AND NOT attisdropped;
  expected_key := ARRAY[company_attnum, document_type_attnum, template_name_attnum]::SMALLINT[];

  IF EXISTS (
    SELECT company_id, document_type, template_name
    FROM public.document_templates
    WHERE company_id IS NOT NULL
    GROUP BY company_id, document_type, template_name
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate company/document_type/template_name values exist. Review and rename duplicates without deleting layouts, then rerun.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.document_templates'::regclass
      AND c.conname = 'uq_doc_templates_company_type_name'
      AND (c.contype <> 'u' OR c.conkey <> expected_key)
  ) THEN
    RAISE EXCEPTION
      'The existing uq_doc_templates_company_type_name constraint has different columns. Review it before rerunning; no layouts were modified.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.document_templates'::regclass
      AND c.contype = 'u'
      AND c.conkey = expected_key
  ) THEN
    ALTER TABLE public.document_templates
      ADD CONSTRAINT uq_doc_templates_company_type_name
      UNIQUE (company_id, document_type, template_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_doc_templates_company_type
  ON public.document_templates (company_id, document_type);

-- Keep exactly one default per company/document type without removing any layout rows.
WITH ranked_defaults AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY company_id, document_type
           ORDER BY is_default DESC, updated_at DESC, created_at DESC, id
         ) AS position
  FROM public.document_templates
)
UPDATE public.document_templates AS t
SET is_default = (r.position = 1)
FROM ranked_defaults AS r
WHERE t.id = r.id
  AND t.is_default IS DISTINCT FROM (r.position = 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_templates_one_default_per_type
  ON public.document_templates (company_id, document_type)
  WHERE is_default IS TRUE AND company_id IS NOT NULL;

-- Add/validate the expected company relationship. Existing orphan rows are preserved;
-- a NOT VALID foreign key still protects all future inserts and updates.
DO $$
DECLARE
  company_attnum SMALLINT;
  company_fk_name TEXT;
  company_fk_validated BOOLEAN;
  company_fk_delete_action "char";
BEGIN
  SELECT a.attnum INTO company_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'public.document_templates'::regclass
    AND a.attname = 'company_id'
    AND NOT a.attisdropped;

  SELECT c.conname, c.convalidated, c.confdeltype
  INTO company_fk_name, company_fk_validated, company_fk_delete_action
  FROM pg_constraint c
  WHERE c.conrelid = 'public.document_templates'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'public.companies'::regclass
    AND c.conkey = ARRAY[company_attnum]::SMALLINT[]
  LIMIT 1;

  IF company_fk_name IS NOT NULL AND company_fk_delete_action <> 'c' THEN
    RAISE EXCEPTION
      'The existing document_templates company foreign key does not use ON DELETE CASCADE. Review that relationship before rerunning; no rows were deleted.';
  END IF;

  IF company_fk_name IS NULL THEN
    ALTER TABLE public.document_templates
      ADD CONSTRAINT document_templates_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE CASCADE NOT VALID;
    company_fk_name := 'document_templates_company_id_fkey';
    company_fk_validated := FALSE;
  END IF;

  IF NOT company_fk_validated AND NOT EXISTS (
    SELECT 1
    FROM public.document_templates t
    LEFT JOIN public.companies c ON c.id = t.company_id
    WHERE t.company_id IS NOT NULL AND c.id IS NULL
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.document_templates VALIDATE CONSTRAINT %I',
      company_fk_name
    );
  ELSIF NOT company_fk_validated THEN
    RAISE WARNING
      'Existing document_templates rows reference missing companies. Rows were preserved; the company foreign key remains NOT VALID until those references are reviewed.';
  END IF;
END $$;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.document_template_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id AND c.owner_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND (p.active IS NULL OR p.active = TRUE)
      AND p.company_id = p_company_id
  );
$$;

REVOKE ALL ON FUNCTION public.document_template_company_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_template_company_access(UUID) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can manage document templates" ON public.document_templates;
DROP POLICY IF EXISTS "Anon users can view document templates" ON public.document_templates;
DROP POLICY IF EXISTS "Company members can manage document templates" ON public.document_templates;

CREATE POLICY "Company members can manage document templates"
  ON public.document_templates
  FOR ALL
  TO authenticated
  USING (public.document_template_company_access(company_id))
  WITH CHECK (public.document_template_company_access(company_id));

REVOKE ALL ON TABLE public.document_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_templates TO authenticated;

COMMENT ON TABLE public.document_templates IS
  'Company-owned JSONB A4 PDF Designer layouts and named style presets.';

NOTIFY pgrst, 'reload schema';
COMMIT;
