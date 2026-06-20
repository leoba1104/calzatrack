-- Migration 009: daily cash register closing reports
-- Stores a snapshot of each day's totals so management can review history
-- without recalculating from raw transactions.

CREATE TABLE IF NOT EXISTS cierres_caja (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id           UUID        NOT NULL REFERENCES tiendas(id),
  fecha               DATE        NOT NULL,

  -- Totals by payment method (from pagos_venta that day)
  efectivo            NUMERIC(12,2) NOT NULL DEFAULT 0,
  tarjeta             NUMERIC(12,2) NOT NULL DEFAULT 0,
  sinpe               NUMERIC(12,2) NOT NULL DEFAULT 0,
  transferencia       NUMERIC(12,2) NOT NULL DEFAULT 0,
  otro                NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Breakdown by sale type
  total_contado       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_apartados     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_creditos      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_dia           NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Physical inventory moved
  pares_vendidos      INT          NOT NULL DEFAULT 0,

  -- Snapshot of open positions at closing time
  apartados_abiertos  INT          NOT NULL DEFAULT 0,
  creditos_abiertos   INT          NOT NULL DEFAULT 0,

  -- Optional notes from the person doing the close
  notas               TEXT,

  cerrado_por         UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Only one closing per store per day
  UNIQUE (tienda_id, fecha)
);

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read closings for their tienda; admin reads all
CREATE POLICY "cierres_select" ON cierres_caja
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.rol = 'admin' OR profiles.tienda_id = cierres_caja.tienda_id)
    )
  );

-- All authenticated users can insert closings for their tienda; admin inserts for any
CREATE POLICY "cierres_insert" ON cierres_caja
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.rol = 'admin' OR profiles.tienda_id = cierres_caja.tienda_id)
    )
  );
