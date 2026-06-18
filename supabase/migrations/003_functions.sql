-- CalzaTrack — Funciones y Triggers
-- Ejecutar DESPUÉS de 002_rls.sql

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_empleados_updated_at
  BEFORE UPDATE ON empleados FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_variantes_updated_at
  BEFORE UPDATE ON variantes_producto FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventario_updated_at
  BEFORE UPDATE ON inventario_tienda FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ventas_updated_at
  BEFORE UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_proveedores_updated_at
  BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_compras_updated_at
  BEFORE UPDATE ON compras FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER: crear profile al registrar usuario en auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, nombre, apellido)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'nombre',
    NEW.raw_user_meta_data ->> 'apellido'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: manejo de stock en ventas
--
-- Estados que "retienen" stock: apartado, credito, pagada
--
-- Transición:  borrador/null → apartado/credito/pagada  → decrementa stock
-- Transición:  apartado/credito/pagada → anulada        → restaura stock
-- Transición:  apartado → pagada (o credito → pagada)   → sin cambio (ya descontado)
-- ============================================================
CREATE OR REPLACE FUNCTION manage_stock_on_venta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  retiene_new BOOLEAN;
  retiene_old BOOLEAN;
BEGIN
  retiene_new := NEW.estado IN ('apartado', 'credito', 'pagada');
  retiene_old := OLD.estado IN ('apartado', 'credito', 'pagada');

  -- Entrar en estado que retiene stock → descontar
  IF retiene_new AND NOT retiene_old THEN
    UPDATE inventario_tienda it
    SET    stock = stock - dv.cantidad
    FROM   detalle_ventas dv
    WHERE  dv.venta_id = NEW.id
      AND  dv.variante_id = it.variante_id
      AND  it.tienda_id = NEW.tienda_id;
  END IF;

  -- Pasar a anulada desde estado que retenía stock → restaurar
  IF NEW.estado = 'anulada' AND retiene_old THEN
    UPDATE inventario_tienda it
    SET    stock = stock + dv.cantidad
    FROM   detalle_ventas dv
    WHERE  dv.venta_id = NEW.id
      AND  dv.variante_id = it.variante_id
      AND  it.tienda_id = NEW.tienda_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_on_venta
  AFTER UPDATE OF estado ON ventas
  FOR EACH ROW EXECUTE FUNCTION manage_stock_on_venta();

-- ============================================================
-- TRIGGER: manejo de stock en compras
--
-- pendiente → recibida   → incrementa stock (UPSERT)
-- recibida  → anulada    → revierte el stock
-- ============================================================
CREATE OR REPLACE FUNCTION manage_stock_on_compra()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Marcar como recibida → incrementar stock
  IF NEW.estado = 'recibida' AND OLD.estado != 'recibida' THEN
    INSERT INTO inventario_tienda (tienda_id, variante_id, stock)
    SELECT NEW.tienda_id, dc.variante_id, dc.cantidad
    FROM   detalle_compras dc
    WHERE  dc.compra_id = NEW.id
    ON CONFLICT (tienda_id, variante_id)
    DO UPDATE SET stock = inventario_tienda.stock + EXCLUDED.stock;
  END IF;

  -- Anular una compra ya recibida → revertir stock
  IF NEW.estado = 'anulada' AND OLD.estado = 'recibida' THEN
    UPDATE inventario_tienda it
    SET    stock = GREATEST(0, stock - dc.cantidad)
    FROM   detalle_compras dc
    WHERE  dc.compra_id = NEW.id
      AND  dc.variante_id = it.variante_id
      AND  it.tienda_id = NEW.tienda_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_on_compra
  AFTER UPDATE OF estado ON compras
  FOR EACH ROW EXECUTE FUNCTION manage_stock_on_compra();

-- ============================================================
-- FUNCIÓN: generar número de venta correlativo por tienda
-- Retorna: "MAR-00001", "DAL-00003", etc.
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_numero_venta(p_tienda_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_siguiente INTEGER;
  v_prefijo   TEXT;
BEGIN
  UPDATE ventas_secuencias
  SET    siguiente = siguiente + 1
  WHERE  tienda_id = p_tienda_id
  RETURNING siguiente - 1 INTO v_siguiente;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Secuencia no encontrada para tienda %', p_tienda_id;
  END IF;

  SELECT prefijo INTO v_prefijo FROM tiendas WHERE id = p_tienda_id;

  RETURN v_prefijo || '-' || LPAD(v_siguiente::TEXT, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_numero_venta(UUID) TO authenticated;
