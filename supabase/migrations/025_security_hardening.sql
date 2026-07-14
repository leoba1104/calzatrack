-- Migration 025: security hardening (auditoría julio 2026)
-- Idempotente: puede re-ejecutarse sin efectos secundarios.
--
-- A1. profiles_update_self no fijaba tienda_id → un usuario podía moverse
--     de tienda y ganar acceso cross-tienda vía auth_tienda_id().
-- A2. variantes_producto era global: cualquier tienda leía precio_costo de
--     la otra y un owner podía editar variantes ajenas. Ahora tiene
--     tienda_id propio (sincronizado por trigger desde productos), RLS por
--     tienda y SKU único por tienda en vez de global.
-- A4. Funciones SECURITY DEFINER expuestas vía PostgREST a anon/authenticated
--     sin validación interna; search_path mutable en varias funciones.
-- M6. Cierres de caja eran editables por cualquier usuario de la tienda y
--     cerrado_por no se forzaba al usuario autenticado.

-- ============================================================
-- A1. profiles: el usuario no puede cambiar su rol NI su tienda
-- ============================================================
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self"
  ON profiles FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND rol = auth_role()
    AND tienda_id IS NOT DISTINCT FROM auth_tienda_id()
  );

-- ============================================================
-- A2. variantes_producto por tienda
-- ============================================================
ALTER TABLE variantes_producto
  ADD COLUMN IF NOT EXISTS tienda_id UUID REFERENCES tiendas(id);

UPDATE variantes_producto v
SET    tienda_id = p.tienda_id
FROM   productos p
WHERE  p.id = v.producto_id
  AND  v.tienda_id IS NULL;

ALTER TABLE variantes_producto ALTER COLUMN tienda_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_variantes_tienda ON variantes_producto(tienda_id);

-- tienda_id siempre se deriva del producto padre — el frontend no lo envía
CREATE OR REPLACE FUNCTION set_variante_tienda()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  SELECT tienda_id INTO NEW.tienda_id FROM productos WHERE id = NEW.producto_id;
  IF NEW.tienda_id IS NULL THEN
    RAISE EXCEPTION 'Producto % no existe o no es accesible', NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_variante_tienda ON variantes_producto;
CREATE TRIGGER trg_variante_tienda
  BEFORE INSERT OR UPDATE OF producto_id ON variantes_producto
  FOR EACH ROW EXECUTE FUNCTION set_variante_tienda();

-- SKU único por tienda (antes era único global, lo que chocaba con el
-- catálogo por tienda introducido en la migración 023)
ALTER TABLE variantes_producto DROP CONSTRAINT IF EXISTS variantes_producto_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_variantes_tienda_sku ON variantes_producto(tienda_id, sku);

-- RLS por tienda (misma matriz de permisos que antes, pero scoped)
DROP POLICY IF EXISTS "variantes_select" ON variantes_producto;
DROP POLICY IF EXISTS "variantes_insert" ON variantes_producto;
DROP POLICY IF EXISTS "variantes_update" ON variantes_producto;
DROP POLICY IF EXISTS "variantes_delete" ON variantes_producto;

CREATE POLICY "variantes_select"
  ON variantes_producto FOR SELECT TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "variantes_insert"
  ON variantes_producto FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  );

CREATE POLICY "variantes_update"
  ON variantes_producto FOR UPDATE TO authenticated
  USING (
    auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  )
  WITH CHECK (
    auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  );

CREATE POLICY "variantes_delete"
  ON variantes_producto FOR DELETE TO authenticated
  USING (
    auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  );

-- ============================================================
-- A4a. search_path fijo en todas las funciones
-- ============================================================
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT rol FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_tienda_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT tienda_id FROM profiles WHERE id = auth.uid();
$$;

ALTER FUNCTION set_updated_at()          SET search_path = public;
ALTER FUNCTION manage_stock_on_venta()   SET search_path = public;
ALTER FUNCTION manage_stock_on_compra()  SET search_path = public;
ALTER FUNCTION auto_cierre_caja()        SET search_path = public;
ALTER FUNCTION handle_new_user()         SET search_path = public;

-- ============================================================
-- A4b. Revocar EXECUTE que PostgREST exponía a anon/authenticated
-- ============================================================
-- Helpers de RLS: solo los necesita authenticated (se evalúan en políticas)
REVOKE EXECUTE ON FUNCTION auth_role()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auth_tienda_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION auth_role()      TO authenticated;
GRANT  EXECUTE ON FUNCTION auth_tienda_id() TO authenticated;

-- Funciones de trigger y cron: nadie las llama por RPC
REVOKE ALL ON FUNCTION set_updated_at()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION manage_stock_on_venta()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION manage_stock_on_compra() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION handle_new_user()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION auto_cierre_caja()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_variante_tienda()    FROM PUBLIC, anon, authenticated;

-- ============================================================
-- A4c. get_next_numero_venta: validar que la tienda sea la del caller
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_numero_venta(p_tienda_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_siguiente INTEGER;
  v_prefijo   TEXT;
BEGIN
  IF NOT (auth_role() = 'admin' OR p_tienda_id = auth_tienda_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

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

REVOKE EXECUTE ON FUNCTION get_next_numero_venta(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_next_numero_venta(UUID) TO authenticated;

-- ============================================================
-- A4d/M4. reservar_stock_venta: validar tienda del caller y fallar
-- explícitamente si no hay stock (antes GREATEST(0,..) escondía faltantes)
-- ============================================================
CREATE OR REPLACE FUNCTION reservar_stock_venta(p_venta_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tienda_id UUID;
BEGIN
  SELECT tienda_id INTO v_tienda_id FROM ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta % no existe', p_venta_id;
  END IF;
  IF NOT (auth_role() = 'admin' OR v_tienda_id = auth_tienda_id()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  -- El CHECK (stock >= 0) de inventario_tienda aborta la transacción
  -- si no hay stock suficiente — sin clamping silencioso.
  UPDATE inventario_tienda it
  SET    stock = stock - dv.cantidad
  FROM   detalle_ventas dv
  JOIN   ventas v ON v.id = dv.venta_id
  WHERE  dv.venta_id = p_venta_id
    AND  v.tipo IN ('apartado', 'credito')
    AND  it.variante_id = dv.variante_id
    AND  it.tienda_id = v.tienda_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION reservar_stock_venta(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION reservar_stock_venta(UUID) TO authenticated;

-- ============================================================
-- M6. cierres_caja: inmutables salvo admin, cerrado_por forzado
-- ============================================================
DROP POLICY IF EXISTS "cierres_insert" ON cierres_caja;
CREATE POLICY "cierres_insert" ON cierres_caja
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth_role() = 'admin' OR tienda_id = auth_tienda_id())
    AND cerrado_por = auth.uid()
  );

-- La 011 permitía a cualquier usuario de la tienda editar cierres pasados
DROP POLICY IF EXISTS "cierres_update" ON cierres_caja;
CREATE POLICY "cierres_update" ON cierres_caja
  FOR UPDATE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- ventas_secuencias: la secuencia solo se toca vía get_next_numero_venta
-- (SECURITY DEFINER, bypasea RLS); INSERT de tiendas nuevas solo admin
-- ============================================================
DROP POLICY IF EXISTS "secuencias_update" ON ventas_secuencias;
DROP POLICY IF EXISTS "secuencias_insert" ON ventas_secuencias;
CREATE POLICY "secuencias_insert" ON ventas_secuencias
  FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin');
