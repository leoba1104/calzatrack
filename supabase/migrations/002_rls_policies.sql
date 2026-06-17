-- CalzaTrack — Row Level Security Policies
-- Run AFTER 001_initial_schema.sql

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE tiendas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_secuencias ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Returns the current user's role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT rol FROM profiles WHERE id = auth.uid();
$$;

-- Returns the current user's tienda_id (null for admin)
CREATE OR REPLACE FUNCTION auth_tienda_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT tienda_id FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- TIENDAS
-- ============================================================
-- All authenticated users can read stores
CREATE POLICY "tiendas_select"
  ON tiendas FOR SELECT TO authenticated
  USING (true);

-- Only admin can insert/update stores
CREATE POLICY "tiendas_insert"
  ON tiendas FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin');

CREATE POLICY "tiendas_update"
  ON tiendas FOR UPDATE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- PROFILES
-- ============================================================
-- Users can read their own profile; admin can read all
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR auth_role() = 'admin');

-- Users can update their own profile (name only, not role)
CREATE POLICY "profiles_update_self"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND rol = (SELECT rol FROM profiles WHERE id = auth.uid()));

-- Admin can update any profile
CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- CATEGORIAS_PRODUCTO
-- ============================================================
-- All authenticated users can read categories
CREATE POLICY "categorias_select"
  ON categorias_producto FOR SELECT TO authenticated
  USING (true);

-- Only admin can manage categories
CREATE POLICY "categorias_insert"
  ON categorias_producto FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin');

CREATE POLICY "categorias_update"
  ON categorias_producto FOR UPDATE TO authenticated
  USING (auth_role() = 'admin');

CREATE POLICY "categorias_delete"
  ON categorias_producto FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- PRODUCTOS
-- ============================================================
-- Admin sees all; vendedor sees only their store
CREATE POLICY "productos_select"
  ON productos FOR SELECT TO authenticated
  USING (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );

-- Admin inserts anywhere; vendedor only in their store
CREATE POLICY "productos_insert"
  ON productos FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );

CREATE POLICY "productos_update"
  ON productos FOR UPDATE TO authenticated
  USING (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );

CREATE POLICY "productos_delete"
  ON productos FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- CLIENTES (shared — all authenticated users)
-- ============================================================
CREATE POLICY "clientes_select"
  ON clientes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "clientes_insert"
  ON clientes FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "clientes_update"
  ON clientes FOR UPDATE TO authenticated
  USING (true);

-- Only admin can delete clients
CREATE POLICY "clientes_delete"
  ON clientes FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- FACTURAS
-- ============================================================
CREATE POLICY "facturas_select"
  ON facturas FOR SELECT TO authenticated
  USING (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );

CREATE POLICY "facturas_insert"
  ON facturas FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );

CREATE POLICY "facturas_update"
  ON facturas FOR UPDATE TO authenticated
  USING (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );

-- Only admin can delete/void invoices
CREATE POLICY "facturas_delete"
  ON facturas FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ============================================================
-- FACTURA_ITEMS
-- ============================================================
-- Access mirrors the parent factura
CREATE POLICY "factura_items_select"
  ON factura_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM facturas f
      WHERE f.id = factura_id
        AND (auth_role() = 'admin' OR f.tienda_id = auth_tienda_id())
    )
  );

CREATE POLICY "factura_items_insert"
  ON factura_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM facturas f
      WHERE f.id = factura_id
        AND (auth_role() = 'admin' OR f.tienda_id = auth_tienda_id())
    )
  );

CREATE POLICY "factura_items_update"
  ON factura_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM facturas f
      WHERE f.id = factura_id
        AND (auth_role() = 'admin' OR f.tienda_id = auth_tienda_id())
    )
  );

CREATE POLICY "factura_items_delete"
  ON factura_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM facturas f
      WHERE f.id = factura_id
        AND (auth_role() = 'admin' OR f.tienda_id = auth_tienda_id())
    )
  );

-- ============================================================
-- FACTURA_SECUENCIAS
-- ============================================================
CREATE POLICY "secuencias_select"
  ON factura_secuencias FOR SELECT TO authenticated
  USING (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );

CREATE POLICY "secuencias_update"
  ON factura_secuencias FOR UPDATE TO authenticated
  USING (
    auth_role() = 'admin'
    OR tienda_id = auth_tienda_id()
  );
