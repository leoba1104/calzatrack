-- Migration 027: bucket facturas-compra privado (auditoría julio 2026, A5)
--
-- El bucket era público y con política SELECT amplia: cualquier persona sin
-- login podía ver (y listar) las facturas de proveedores. Se vuelve privado;
-- el frontend pasa a usar URLs firmadas (createSignedUrl).
--
-- compras.factura_imagen_url deja de guardar la URL pública completa y pasa
-- a guardar solo el path dentro del bucket (ej: "<compra_id>.jpg").

UPDATE storage.buckets SET public = FALSE WHERE id = 'facturas-compra';

-- Fuera la lectura pública y la política INSERT duplicada
DROP POLICY IF EXISTS "Public read facturas-compra" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload" ON storage.objects;

-- Lectura solo para usuarios autenticados (necesaria para createSignedUrl)
DROP POLICY IF EXISTS "Authenticated read facturas-compra" ON storage.objects;
CREATE POLICY "Authenticated read facturas-compra"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'facturas-compra');

-- Normalizar valores existentes: URL pública completa → path del bucket
UPDATE compras
SET    factura_imagen_url = regexp_replace(factura_imagen_url, '^.*/facturas-compra/', '')
WHERE  factura_imagen_url LIKE 'http%';
