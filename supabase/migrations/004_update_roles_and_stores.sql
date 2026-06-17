-- CalzaTrack — Update store names, roles, and invoice prefix
-- Run AFTER 003_invoice_sequence_fn.sql

-- ============================================================
-- STORE NAMES
-- ============================================================
UPDATE tiendas
SET nombre = 'Zapatería Mariana', descripcion = 'Tienda de calzado de Mariana'
WHERE nombre = 'Tienda Papá';

UPDATE tiendas
SET nombre = 'Zapatería Dali', descripcion = 'Tienda de calzado de Dali'
WHERE nombre = 'Tienda Mamá';

-- ============================================================
-- INVOICE PREFIX COLUMN
-- Needed because both stores share the same first 3 letters ("ZAP")
-- when derived from their names.
-- ============================================================
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS prefijo TEXT;

UPDATE tiendas SET prefijo = 'MAR' WHERE nombre = 'Zapatería Mariana';
UPDATE tiendas SET prefijo = 'DAL' WHERE nombre = 'Zapatería Dali';

-- Update the invoice function to use the explicit prefix column
CREATE OR REPLACE FUNCTION get_next_factura_number(p_tienda_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_siguiente INTEGER;
  v_prefix    TEXT;
BEGIN
  UPDATE factura_secuencias
  SET    siguiente = siguiente + 1
  WHERE  tienda_id = p_tienda_id
  RETURNING siguiente - 1 INTO v_siguiente;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Secuencia no encontrada para tienda %', p_tienda_id;
  END IF;

  SELECT COALESCE(
    prefijo,
    LEFT(UPPER(REGEXP_REPLACE(nombre, '[^a-zA-Z]', '', 'g')), 3)
  )
  INTO v_prefix
  FROM tiendas
  WHERE id = p_tienda_id;

  RETURN v_prefix || '-' || LPAD(v_siguiente::TEXT, 5, '0');
END;
$$;

-- ============================================================
-- ROLES: admin | owner | employee  (previously admin | vendedor)
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('admin', 'owner', 'employee'));

-- Migrate existing 'vendedor' users to 'owner'
UPDATE profiles SET rol = 'owner' WHERE rol = 'vendedor';

-- New users default to 'employee' instead of 'vendedor'
ALTER TABLE profiles ALTER COLUMN rol SET DEFAULT 'employee';

-- ============================================================
-- RLS — allow owners to see profiles in their store
-- ============================================================
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  );

-- Admin can insert profiles (for inviting new users via dashboard)
CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'admin');
