-- Supplier Bill product persistence repair
-- Safe/non-destructive: adds product_id only if missing.

ALTER TABLE public.supplier_bill_items
ADD COLUMN IF NOT EXISTS product_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_bill_items_product_id_fkey'
  ) THEN
    ALTER TABLE public.supplier_bill_items
    ADD CONSTRAINT supplier_bill_items_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES public.products(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_bill_items_product_id
ON public.supplier_bill_items(product_id);
