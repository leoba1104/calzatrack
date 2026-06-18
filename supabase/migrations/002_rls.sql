-- CalzaTrack — Row Level Security
-- Ejecutar DESPUÉS de 001_schema.sql

-- ============================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================
ALTER TABLE tiendas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados           ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE variantes_producto  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_tienda   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_ventas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_venta         ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras             ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_compras     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_secuencias   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCIONES HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT rol FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_tienda_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT tienda_id FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- TIENDAS — todos leen, solo admin escribe
-- ============================================================
CREATE POLICY "tiendas_select"
  ON tiendas FOR SELECT TO authenticated USING (true);

CREATE POLICY "tiendas_insert"
  ON tiendas FOR INSERT TO authenticated WITH CHECK (auth_role() = 'admin');

CREATE POLICY "tiendas_update"
  ON tiendas FOR UPDATE TO authenticated USING (auth_role() = 'admin');

CREATE POLICY "tiendas_delete"
  ON tiendas FOR DELETE TO authenticated USING (auth_role() = 'admin');

-- ============================================================
-- PROFILES — cada uno ve el suyo; admin ve todos; owner ve su tienda
-- ============================================================
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  );

-- Usuario solo puede actualizar su propio perfil (no puede cambiar su rol)
CREATE POLICY "profiles_update_self"
  ON profiles FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid() AND rol = (SELECT rol FROM profiles WHERE id = auth.uid()));

CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin');

CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- EMPLEADOS — todos ven su tienda; solo admin/owner gestionan
-- ============================================================
CREATE POLICY "empleados_select"
  ON empleados FOR SELECT TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "empleados_insert"
  ON empleados FOR INSERT TO authenticated
  WITH CHECK (auth_role() IN ('admin', 'owner'));

CREATE POLICY "empleados_update"
  ON empleados FOR UPDATE TO authenticated
  USING (auth_role() IN ('admin', 'owner'));

CREATE POLICY "empleados_delete"
  ON empleados FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- CATÁLOGO (marcas, categorias) — todos leen; admin/owner escriben
-- ============================================================
CREATE POLICY "marcas_select"
  ON marcas FOR SELECT TO authenticated USING (true);

CREATE POLICY "marcas_write"
  ON marcas FOR INSERT TO authenticated WITH CHECK (auth_role() IN ('admin', 'owner'));

CREATE POLICY "marcas_update"
  ON marcas FOR UPDATE TO authenticated USING (auth_role() IN ('admin', 'owner'));

CREATE POLICY "marcas_delete"
  ON marcas FOR DELETE TO authenticated USING (auth_role() = 'admin');

CREATE POLICY "categorias_select"
  ON categorias FOR SELECT TO authenticated USING (true);

CREATE POLICY "categorias_write"
  ON categorias FOR INSERT TO authenticated WITH CHECK (auth_role() IN ('admin', 'owner'));

CREATE POLICY "categorias_update"
  ON categorias FOR UPDATE TO authenticated USING (auth_role() IN ('admin', 'owner'));

CREATE POLICY "categorias_delete"
  ON categorias FOR DELETE TO authenticated USING (auth_role() = 'admin');

-- ============================================================
-- PRODUCTOS Y VARIANTES — todos leen; admin/owner escriben
-- ============================================================
CREATE POLICY "productos_select"
  ON productos FOR SELECT TO authenticated USING (true);

CREATE POLICY "productos_insert"
  ON productos FOR INSERT TO authenticated WITH CHECK (auth_role() IN ('admin', 'owner'));

CREATE POLICY "productos_update"
  ON productos FOR UPDATE TO authenticated USING (auth_role() IN ('admin', 'owner'));

CREATE POLICY "productos_delete"
  ON productos FOR DELETE TO authenticated USING (auth_role() = 'admin');

CREATE POLICY "variantes_select"
  ON variantes_producto FOR SELECT TO authenticated USING (true);

CREATE POLICY "variantes_insert"
  ON variantes_producto FOR INSERT TO authenticated WITH CHECK (auth_role() IN ('admin', 'owner'));

CREATE POLICY "variantes_update"
  ON variantes_producto FOR UPDATE TO authenticated USING (auth_role() IN ('admin', 'owner'));

CREATE POLICY "variantes_delete"
  ON variantes_producto FOR DELETE TO authenticated USING (auth_role() = 'admin');

-- ============================================================
-- INVENTARIO — scoped por tienda; todos pueden ver y actualizar el suyo
-- ============================================================
CREATE POLICY "inventario_select"
  ON inventario_tienda FOR SELECT TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "inventario_insert"
  ON inventario_tienda FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "inventario_update"
  ON inventario_tienda FOR UPDATE TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "inventario_delete"
  ON inventario_tienda FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- CLIENTES — compartido entre todas las tiendas; todos pueden CRUD
-- ============================================================
CREATE POLICY "clientes_select"
  ON clientes FOR SELECT TO authenticated USING (true);

CREATE POLICY "clientes_insert"
  ON clientes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "clientes_update"
  ON clientes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "clientes_delete"
  ON clientes FOR DELETE TO authenticated USING (auth_role() = 'admin');

-- ============================================================
-- VENTAS — scoped por tienda; solo admin puede eliminar
-- ============================================================
CREATE POLICY "ventas_select"
  ON ventas FOR SELECT TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "ventas_insert"
  ON ventas FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "ventas_update"
  ON ventas FOR UPDATE TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "ventas_delete"
  ON ventas FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- DETALLE VENTAS — hereda acceso de la venta padre
-- ============================================================
CREATE POLICY "detalle_ventas_select"
  ON detalle_ventas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ventas v WHERE v.id = venta_id
      AND (auth_role() = 'admin' OR v.tienda_id = auth_tienda_id())
  ));

CREATE POLICY "detalle_ventas_insert"
  ON detalle_ventas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM ventas v WHERE v.id = venta_id
      AND (auth_role() = 'admin' OR v.tienda_id = auth_tienda_id())
  ));

CREATE POLICY "detalle_ventas_delete"
  ON detalle_ventas FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ventas v WHERE v.id = venta_id
      AND (auth_role() = 'admin' OR v.tienda_id = auth_tienda_id())
  ));

-- ============================================================
-- PAGOS DE VENTA — hereda acceso de la venta padre
-- ============================================================
CREATE POLICY "pagos_venta_select"
  ON pagos_venta FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ventas v WHERE v.id = venta_id
      AND (auth_role() = 'admin' OR v.tienda_id = auth_tienda_id())
  ));

CREATE POLICY "pagos_venta_insert"
  ON pagos_venta FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM ventas v WHERE v.id = venta_id
      AND (auth_role() = 'admin' OR v.tienda_id = auth_tienda_id())
  ));

CREATE POLICY "pagos_venta_delete"
  ON pagos_venta FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- PROVEEDORES — todos leen; admin/owner gestionan
-- ============================================================
CREATE POLICY "proveedores_select"
  ON proveedores FOR SELECT TO authenticated USING (true);

CREATE POLICY "proveedores_insert"
  ON proveedores FOR INSERT TO authenticated WITH CHECK (auth_role() IN ('admin', 'owner'));

CREATE POLICY "proveedores_update"
  ON proveedores FOR UPDATE TO authenticated USING (auth_role() IN ('admin', 'owner'));

CREATE POLICY "proveedores_delete"
  ON proveedores FOR DELETE TO authenticated USING (auth_role() = 'admin');

-- ============================================================
-- COMPRAS — scoped por tienda
-- ============================================================
CREATE POLICY "compras_select"
  ON compras FOR SELECT TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "compras_insert"
  ON compras FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "compras_update"
  ON compras FOR UPDATE TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "compras_delete"
  ON compras FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- DETALLE COMPRAS — hereda acceso de la compra padre
-- ============================================================
CREATE POLICY "detalle_compras_select"
  ON detalle_compras FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM compras c WHERE c.id = compra_id
      AND (auth_role() = 'admin' OR c.tienda_id = auth_tienda_id())
  ));

CREATE POLICY "detalle_compras_insert"
  ON detalle_compras FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM compras c WHERE c.id = compra_id
      AND (auth_role() = 'admin' OR c.tienda_id = auth_tienda_id())
  ));

CREATE POLICY "detalle_compras_delete"
  ON detalle_compras FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM compras c WHERE c.id = compra_id
      AND auth_role() = 'admin'
  ));

-- ============================================================
-- VENTAS SECUENCIAS
-- ============================================================
CREATE POLICY "secuencias_select"
  ON ventas_secuencias FOR SELECT TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());

CREATE POLICY "secuencias_update"
  ON ventas_secuencias FOR UPDATE TO authenticated
  USING (auth_role() = 'admin' OR tienda_id = auth_tienda_id());
