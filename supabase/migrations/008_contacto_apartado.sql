-- Migration 008: contact fields for anonymous apartado customers
-- These columns let apartados store a name/phone without requiring a registered client.
-- For registered clients the client's data shows in the UI; these columns take precedence
-- so the stored contact info always reflects what was captured at reservation time.
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS contacto_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS contacto_apellido TEXT,
  ADD COLUMN IF NOT EXISTS contacto_telefono TEXT;
