-- Migration 016: dashboard notes per store
CREATE TABLE notas_tienda (
  tienda_id  UUID PRIMARY KEY REFERENCES tiendas(id) ON DELETE CASCADE,
  contenido  TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
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
