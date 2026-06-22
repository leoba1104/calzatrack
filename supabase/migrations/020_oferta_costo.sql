-- Migration 020: precio_costo, en_oferta, precio_oferta on variantes_producto

ALTER TABLE variantes_producto
  ADD COLUMN IF NOT EXISTS precio_costo  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  ADD COLUMN IF NOT EXISTS en_oferta     BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS precio_oferta NUMERIC(12, 2)          CHECK (precio_oferta > 0);
