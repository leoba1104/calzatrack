-- CalzaTrack — Invoice sequence RPC function
-- Run AFTER 002_rls_policies.sql

-- Atomically increments the invoice sequence for a store and returns
-- a formatted invoice number like "TPA-00001" or "TMA-00001"
CREATE OR REPLACE FUNCTION get_next_factura_number(p_tienda_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_siguiente  INTEGER;
  v_prefix     TEXT;
BEGIN
  -- Atomically get current number and increment (prevents race conditions)
  UPDATE factura_secuencias
  SET    siguiente = siguiente + 1
  WHERE  tienda_id = p_tienda_id
  RETURNING siguiente - 1 INTO v_siguiente;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Secuencia no encontrada para tienda %', p_tienda_id;
  END IF;

  -- Build a 3-letter prefix from the store name (letters only, uppercase)
  SELECT LEFT(UPPER(REGEXP_REPLACE(nombre, '[^a-zA-Z]', '', 'g')), 3)
  INTO   v_prefix
  FROM   tiendas
  WHERE  id = p_tienda_id;

  RETURN v_prefix || '-' || LPAD(v_siguiente::TEXT, 5, '0');
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_next_factura_number(UUID) TO authenticated;
