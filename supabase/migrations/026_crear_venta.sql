-- Migration 026: RPC transaccional crear_venta (auditoría julio 2026, M2/M3/M4)
--
-- Antes el frontend creaba una venta en 5 llamadas encadenadas (número →
-- venta → líneas → estado/reserva → pago): un fallo intermedio dejaba ventas
-- huérfanas, números quemados o stock inconsistente, y la BD aceptaba
-- precios/totales calculados por el cliente.
--
-- Esta función hace todo en una transacción:
--   • valida rol/tienda del caller
--   • recalcula precios desde variantes_producto (ignora precios del cliente)
--   • bloquea el stock con FOR UPDATE y falla con STOCK_INSUFICIENTE:<sku>
--   • genera el número correlativo, inserta venta + líneas + pago inicial
--
-- El trigger trg_stock_on_venta sigue vigente para transiciones posteriores
-- (anular restaura stock; pendiente→pagada de apartado/crédito no re-descuenta).
-- La venta se inserta ya en su estado final y el stock lo descuenta esta
-- función directamente, por lo que el trigger (que solo dispara en UPDATE)
-- no interviene en la creación.

CREATE OR REPLACE FUNCTION crear_venta(
  p_tienda_id         UUID,
  p_tipo              TEXT,
  p_items             JSONB,             -- [{"variante_id": uuid, "cantidad": int}, ...]
  p_cliente_id        UUID    DEFAULT NULL,
  p_empleado_id       UUID    DEFAULT NULL,
  p_categoria_venta   TEXT    DEFAULT NULL,
  p_metodo_pago       TEXT    DEFAULT NULL,
  p_descuento_pct     NUMERIC DEFAULT 0,
  p_abono_inicial     NUMERIC DEFAULT 0,
  p_contacto_nombre   TEXT    DEFAULT NULL,
  p_contacto_apellido TEXT    DEFAULT NULL,
  p_contacto_telefono TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_item      RECORD;
  v_variante  RECORD;
  v_stock     INTEGER;
  v_precio    NUMERIC;
  v_subtotal  NUMERIC := 0;
  v_descuento NUMERIC := 0;
  v_total     NUMERIC;
  v_oferta    BOOLEAN := FALSE;
  v_moroso    BOOLEAN;
  v_numero    TEXT;
  v_estado    TEXT;
  v_venta_id  UUID;
  v_lineas    JSONB := '[]'::JSONB;
BEGIN
  -- ── Autorización y validaciones ────────────────────────────
  IF NOT (auth_role() = 'admin' OR p_tienda_id = auth_tienda_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF p_tipo NOT IN ('contado', 'apartado', 'credito') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'NO_ITEMS';
  END IF;
  IF p_metodo_pago IS NOT NULL
     AND p_metodo_pago NOT IN ('efectivo', 'tarjeta', 'sinpe', 'transferencia', 'otro') THEN
    RAISE EXCEPTION 'METODO_PAGO_INVALIDO';
  END IF;
  IF p_tipo = 'contado' AND p_categoria_venta IS NULL THEN
    RAISE EXCEPTION 'NO_CATEGORIA';
  END IF;
  IF p_tipo = 'contado' AND p_metodo_pago IS NULL THEN
    RAISE EXCEPTION 'NO_PAGO';
  END IF;
  IF p_tipo = 'credito' THEN
    IF p_cliente_id IS NULL THEN
      RAISE EXCEPTION 'NO_CLIENTE_CREDITO';
    END IF;
    SELECT moroso INTO v_moroso FROM clientes WHERE id = p_cliente_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CLIENTE_INVALIDO';
    END IF;
    IF v_moroso THEN
      RAISE EXCEPTION 'CLIENTE_MOROSO';
    END IF;
  END IF;
  IF p_tipo = 'apartado'
     AND (COALESCE(TRIM(p_contacto_nombre), '') = '' OR COALESCE(TRIM(p_contacto_apellido), '') = '') THEN
    RAISE EXCEPTION 'CONTACTO_REQUERIDO';
  END IF;
  IF p_tipo <> 'contado' AND COALESCE(p_abono_inicial, 0) > 0 AND p_metodo_pago IS NULL THEN
    RAISE EXCEPTION 'NO_PAGO';
  END IF;

  -- ── Líneas: precio del servidor + lock y descuento de stock ─
  FOR v_item IN
    SELECT (e ->> 'variante_id')::UUID AS variante_id,
           (e ->> 'cantidad')::INT     AS cantidad
    FROM jsonb_array_elements(p_items) e
  LOOP
    IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;

    SELECT sku, precio, precio_oferta, en_oferta, activo, tienda_id
    INTO   v_variante
    FROM   variantes_producto
    WHERE  id = v_item.variante_id;

    IF NOT FOUND OR v_variante.tienda_id <> p_tienda_id OR NOT v_variante.activo THEN
      RAISE EXCEPTION 'VARIANTE_INVALIDA';
    END IF;

    v_precio := CASE
      WHEN v_variante.en_oferta AND v_variante.precio_oferta IS NOT NULL
        THEN v_variante.precio_oferta
      ELSE v_variante.precio
    END;
    IF v_variante.en_oferta THEN
      v_oferta := TRUE;
    END IF;

    SELECT stock INTO v_stock
    FROM   inventario_tienda
    WHERE  tienda_id = p_tienda_id AND variante_id = v_item.variante_id
    FOR UPDATE;

    IF NOT FOUND OR v_stock < v_item.cantidad THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_variante.sku;
    END IF;

    UPDATE inventario_tienda
    SET    stock = stock - v_item.cantidad
    WHERE  tienda_id = p_tienda_id AND variante_id = v_item.variante_id;

    v_subtotal := v_subtotal + v_item.cantidad * v_precio;
    v_lineas   := v_lineas || jsonb_build_object(
      'variante_id', v_item.variante_id,
      'cantidad',    v_item.cantidad,
      'precio',      v_precio
    );
  END LOOP;

  -- ── Totales (ventas con oferta no admiten descuento adicional) ─
  IF v_oferta THEN
    p_descuento_pct := 0;
  END IF;
  p_descuento_pct := LEAST(GREATEST(COALESCE(p_descuento_pct, 0), 0), 100);
  v_descuento     := ROUND(v_subtotal * p_descuento_pct / 100);
  v_total         := v_subtotal - v_descuento;

  v_numero := get_next_numero_venta(p_tienda_id);

  v_estado := CASE
    WHEN p_tipo = 'contado' THEN 'pagada'
    WHEN p_tipo = 'credito' AND COALESCE(p_abono_inicial, 0) >= v_total THEN 'pagada'
    ELSE 'pendiente'
  END;

  INSERT INTO ventas (
    tienda_id, cliente_id, empleado_id, numero_venta,
    subtotal, impuesto, descuento, total,
    tipo, categoria_venta, estado,
    contacto_nombre, contacto_apellido, contacto_telefono
  ) VALUES (
    p_tienda_id, p_cliente_id, p_empleado_id, v_numero,
    v_subtotal, 0, v_descuento, v_total,
    p_tipo,
    CASE WHEN p_tipo = 'contado' THEN p_categoria_venta END,
    v_estado,
    NULLIF(TRIM(p_contacto_nombre), ''),
    NULLIF(TRIM(p_contacto_apellido), ''),
    NULLIF(TRIM(p_contacto_telefono), '')
  )
  RETURNING id INTO v_venta_id;

  INSERT INTO detalle_ventas (venta_id, variante_id, cantidad, precio_unitario, descuento_item, subtotal)
  SELECT v_venta_id,
         (l ->> 'variante_id')::UUID,
         (l ->> 'cantidad')::INT,
         (l ->> 'precio')::NUMERIC,
         0,
         (l ->> 'cantidad')::INT * (l ->> 'precio')::NUMERIC
  FROM jsonb_array_elements(v_lineas) l;

  IF p_tipo = 'contado' THEN
    INSERT INTO pagos_venta (venta_id, empleado_id, monto, tipo_pago)
    VALUES (v_venta_id, p_empleado_id, v_total, p_metodo_pago);
  ELSIF COALESCE(p_abono_inicial, 0) > 0 THEN
    INSERT INTO pagos_venta (venta_id, empleado_id, monto, tipo_pago)
    VALUES (v_venta_id, p_empleado_id, p_abono_inicial, p_metodo_pago);
  END IF;

  RETURN jsonb_build_object(
    'venta_id',     v_venta_id,
    'numero_venta', v_numero,
    'subtotal',     v_subtotal,
    'descuento',    v_descuento,
    'total',        v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION crear_venta(UUID, TEXT, JSONB, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crear_venta(UUID, TEXT, JSONB, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
