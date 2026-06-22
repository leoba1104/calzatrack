-- Migration 021: fix stock management for apartado / crédito
--
-- Problem: the trigger fires on pendiente → pagada for ALL tipos, but for
-- apartado/crédito the items are physically reserved at creation, so stock
-- should be decremented then — not again when paid.
-- Additionally, cancelling (pendiente → anulada) for apartado/crédito was not
-- restoring stock because retiene_old was false for 'pendiente'.
--
-- Fix:
--   • pendiente → pagada  : only decrement stock for tipo = 'contado'
--   • anulada             : restore stock for contado (if retiene_old) OR
--                           for apartado/crédito always (reserved at creation)
--   • New RPC reservar_stock_venta(p_venta_id) : call after inserting
--     detalle_ventas when tipo = 'apartado' | 'credito'

CREATE OR REPLACE FUNCTION manage_stock_on_venta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  retiene_old BOOLEAN;
BEGIN
  retiene_old := OLD.estado IN ('apartado', 'credito', 'pagada');

  -- pendiente → pagada: decrement only for contado
  -- apartado/crédito already reserved stock at creation via reservar_stock_venta()
  IF NEW.estado = 'pagada' AND OLD.estado = 'pendiente' AND NEW.tipo = 'contado' THEN
    UPDATE inventario_tienda it
    SET    stock = stock - dv.cantidad
    FROM   detalle_ventas dv
    WHERE  dv.venta_id = NEW.id
      AND  dv.variante_id = it.variante_id
      AND  it.tienda_id = NEW.tienda_id;
  END IF;

  -- anulada: restore stock
  --   contado  → only if it was already in a retaining state (pagada)
  --   apartado/crédito → always (stock was reserved at creation)
  IF NEW.estado = 'anulada' THEN
    IF (NEW.tipo = 'contado' AND retiene_old)
       OR NEW.tipo IN ('apartado', 'credito')
    THEN
      UPDATE inventario_tienda it
      SET    stock = stock + dv.cantidad
      FROM   detalle_ventas dv
      WHERE  dv.venta_id = NEW.id
        AND  dv.variante_id = it.variante_id
        AND  it.tienda_id = NEW.tienda_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- RPC: call from frontend after inserting detalle_ventas for apartado/crédito
CREATE OR REPLACE FUNCTION reservar_stock_venta(p_venta_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE inventario_tienda it
  SET    stock = GREATEST(0, stock - dv.cantidad)
  FROM   detalle_ventas dv
  JOIN   ventas v ON v.id = dv.venta_id
  WHERE  dv.venta_id = p_venta_id
    AND  v.tipo IN ('apartado', 'credito')
    AND  it.variante_id = dv.variante_id
    AND  it.tienda_id = v.tienda_id;
END;
$$;
