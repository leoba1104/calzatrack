-- Migration 012: allow multiple cierres per day, add 'desde' period start
-- Each cierre now covers the window [desde, created_at].
-- The UNIQUE(tienda_id, fecha) constraint is dropped so a second cierre can be
-- created for late sales without overwriting the first one.

ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS desde TIMESTAMPTZ;

-- Backfill: existing cierres started at the beginning of their day (Costa Rica)
UPDATE cierres_caja
SET desde = (fecha::TEXT || 'T00:00:00')::TIMESTAMPTZ AT TIME ZONE 'America/Costa_Rica'
WHERE desde IS NULL;

ALTER TABLE cierres_caja ALTER COLUMN desde SET NOT NULL;

-- Drop the unique constraint — multiple cierres per day are now allowed
ALTER TABLE cierres_caja DROP CONSTRAINT IF EXISTS cierres_caja_tienda_id_fecha_key;
