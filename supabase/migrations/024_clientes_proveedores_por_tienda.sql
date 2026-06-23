-- Migration 024: Make clientes and proveedores per-store

-- ── clientes ──────────────────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tienda_id UUID REFERENCES tiendas(id);

UPDATE clientes SET tienda_id = (SELECT id FROM tiendas WHERE prefijo = 'MAR') WHERE tienda_id IS NULL;

ALTER TABLE clientes ALTER COLUMN tienda_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_tienda_id ON clientes(tienda_id);

DROP POLICY IF EXISTS "clientes_select" ON clientes;
DROP POLICY IF EXISTS "clientes_insert" ON clientes;
DROP POLICY IF EXISTS "clientes_update" ON clientes;
DROP POLICY IF EXISTS "clientes_delete" ON clientes;

CREATE POLICY "clientes_select" ON clientes FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clientes_insert" ON clientes FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clientes_update" ON clientes FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clientes_delete" ON clientes FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

-- ── proveedores ───────────────────────────────────────────────────
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tienda_id UUID REFERENCES tiendas(id);

UPDATE proveedores SET tienda_id = (SELECT id FROM tiendas WHERE prefijo = 'MAR') WHERE tienda_id IS NULL;

ALTER TABLE proveedores ALTER COLUMN tienda_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proveedores_tienda_id ON proveedores(tienda_id);

DROP POLICY IF EXISTS "proveedores_select" ON proveedores;
DROP POLICY IF EXISTS "proveedores_insert" ON proveedores;
DROP POLICY IF EXISTS "proveedores_update" ON proveedores;
DROP POLICY IF EXISTS "proveedores_delete" ON proveedores;

CREATE POLICY "proveedores_select" ON proveedores FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "proveedores_insert" ON proveedores FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "proveedores_update" ON proveedores FOR UPDATE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "proveedores_delete" ON proveedores FOR DELETE
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE rol = 'admin')
    OR tienda_id IN (SELECT tienda_id FROM profiles WHERE id = auth.uid())
  );
