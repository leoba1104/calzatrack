-- Compras v2: free-text line items, image upload, nullable variante_id
--
-- detalle_compras:
--   • variante_id → nullable (new orders don't have variants yet)
--   • descripcion TEXT — free-text product description entered at purchase time
--   • producto_id  → nullable FK to productos (auto-created as inactive when crear_producto = true)
--
-- compras:
--   • factura_imagen_url TEXT — Supabase Storage URL for the scanned/photographed paper invoice

ALTER TABLE detalle_compras
  ALTER COLUMN variante_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS descripcion   TEXT,
  ADD COLUMN IF NOT EXISTS producto_id   UUID REFERENCES productos(id) ON DELETE SET NULL;

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS factura_imagen_url TEXT;

-- Index for product → purchase lookup (useful when receiving and linking to catalog)
CREATE INDEX IF NOT EXISTS idx_detalle_compras_producto_id ON detalle_compras(producto_id);

-- Storage bucket policy note (apply in Supabase dashboard or with Storage API):
-- Bucket name : facturas-compra
-- Public read : true
-- Allowed mime: image/*, application/pdf
-- Max size    : 10 MB
