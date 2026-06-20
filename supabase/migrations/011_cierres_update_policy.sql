-- Migration 011: add UPDATE policy to cierres_caja
-- The upsert in CierreCajaModal uses INSERT ... ON CONFLICT DO UPDATE,
-- which requires an UPDATE policy in addition to the INSERT policy from 009.

CREATE POLICY "cierres_update" ON cierres_caja
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.rol = 'admin' OR profiles.tienda_id = cierres_caja.tienda_id)
    )
  );
