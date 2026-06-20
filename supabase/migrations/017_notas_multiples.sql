-- Migration 017: replace single-text notas_tienda with a multi-note board
DROP TABLE IF EXISTS notas_tienda;

CREATE TABLE notas_tienda (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id  UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  contenido  TEXT NOT NULL DEFAULT '',
  color      VARCHAR(20) NOT NULL DEFAULT 'yellow',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notas_tienda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_select" ON notas_tienda FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
    AND (profiles.rol = 'admin' OR profiles.tienda_id = notas_tienda.tienda_id))
);
CREATE POLICY "notas_insert" ON notas_tienda FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
    AND (profiles.rol = 'admin' OR profiles.tienda_id = notas_tienda.tienda_id))
);
CREATE POLICY "notas_update" ON notas_tienda FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
    AND (profiles.rol = 'admin' OR profiles.tienda_id = notas_tienda.tienda_id))
);
CREATE POLICY "notas_delete" ON notas_tienda FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
    AND (profiles.rol = 'admin' OR profiles.tienda_id = notas_tienda.tienda_id))
);
