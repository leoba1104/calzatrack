-- Migration 028: bucket facturas-compra reproducible por ambiente
--
-- Hasta ahora el bucket y sus políticas de INSERT/UPDATE se habían creado a
-- mano en el dashboard de prod. Esta migración los define en código para que
-- cualquier ambiente (dev, prod, futuro staging) quede idéntico.
-- Idempotente: en prod el bucket ya existe (ON CONFLICT DO NOTHING).

INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas-compra', 'facturas-compra', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Lectura solo autenticados (necesaria para createSignedUrl) — ya existe en
-- prod desde la 027; se recrea por si el ambiente es nuevo
DROP POLICY IF EXISTS "Authenticated read facturas-compra" ON storage.objects;
CREATE POLICY "Authenticated read facturas-compra"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'facturas-compra');

DROP POLICY IF EXISTS "Authenticated upload facturas-compra" ON storage.objects;
CREATE POLICY "Authenticated upload facturas-compra"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'facturas-compra');

-- El upsert de PurchaseModal (upload con { upsert: true }) requiere UPDATE
DROP POLICY IF EXISTS "Authenticated update facturas-compra" ON storage.objects;
CREATE POLICY "Authenticated update facturas-compra"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'facturas-compra');
