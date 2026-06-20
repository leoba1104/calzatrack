-- Migration 014: add categoria_venta to ventas (subdivides contado sales),
-- and matching breakdown columns to cierres_caja for reporting.

-- ventas: categoría solo aplica a tipo='contado'
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS categoria_venta VARCHAR(20);
-- Valid values: hombre, mujer, nino, fajas, bolsos, ofertas

-- cierres_caja: breakdown por categoría de contado
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS total_hombre  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS total_mujer   NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS total_nino    NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS total_fajas   NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS total_bolsos  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS total_ofertas NUMERIC(12,2) NOT NULL DEFAULT 0;
