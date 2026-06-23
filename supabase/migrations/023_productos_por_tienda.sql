-- Migration 023: Make productos per-store by adding tienda_id
-- Previously productos/variantes_producto were a shared global catalog.
-- Each store now owns its own product catalog independently.

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS tienda_id UUID REFERENCES tiendas(id);

-- Assign existing test products to Mariana (all stock entries are for MAR)
UPDATE productos
SET tienda_id = (SELECT id FROM tiendas WHERE prefijo = 'MAR')
WHERE tienda_id IS NULL;

-- Enforce NOT NULL going forward
ALTER TABLE productos
  ALTER COLUMN tienda_id SET NOT NULL;

-- Create index for common filter
CREATE INDEX IF NOT EXISTS idx_productos_tienda_id ON productos(tienda_id);

-- ── RLS ───────────────────────────────────────────────────────────
-- Drop existing policies and recreate with tienda_id filter

DROP POLICY IF EXISTS "productos_select" ON productos;
DROP POLICY IF EXISTS "productos_insert" ON productos;
DROP POLICY IF EXISTS "productos_update" ON productos;
DROP POLICY IF EXISTS "productos_delete" ON productos;

-- Admin sees and manages everything
CREATE POLICY "productos_select" ON productos FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "productos_insert" ON productos FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid() AND rol IN ('owner', 'employee'))
  );

CREATE POLICY "productos_update" ON productos FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid() AND rol IN ('owner', 'employee'))
  );

CREATE POLICY "productos_delete" ON productos FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid() AND rol = 'owner')
  );
