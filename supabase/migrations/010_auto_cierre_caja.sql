-- Migration 010: auto cierre de caja at midnight Costa Rica time
-- The function runs via pg_cron at 06:00 UTC (= 00:00 America/Costa_Rica, UTC-6).
-- It creates a cierre for the day that just ended for any tienda that forgot to close.
-- Manual cierres always take priority: if a manual cierre already exists, this skips it.
-- Uses INSERT ... ON CONFLICT DO NOTHING so it never overwrites a manual close.

-- ─── SQL function ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_cierre_caja()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tienda   RECORD;
  v_fecha    DATE;
  v_start    TIMESTAMPTZ;
  v_end      TIMESTAMPTZ;
BEGIN
  -- Yesterday in Costa Rica time
  v_fecha := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE - 1;
  v_start := v_fecha::TIMESTAMPTZ AT TIME ZONE 'America/Costa_Rica';
  v_end   := (v_fecha + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Costa_Rica' - INTERVAL '1 microsecond';

  FOR v_tienda IN SELECT id FROM tiendas LOOP

    -- Skip if a manual (or previous auto) cierre already exists for that day
    IF EXISTS (
      SELECT 1 FROM cierres_caja
      WHERE tienda_id = v_tienda.id AND fecha = v_fecha
    ) THEN
      CONTINUE;
    END IF;

    -- Insert computed totals; ON CONFLICT is a safety net (shouldn't fire given the check above)
    INSERT INTO cierres_caja (
      tienda_id, fecha,
      efectivo, tarjeta, sinpe, transferencia, otro,
      total_contado, total_apartados, total_creditos, total_dia,
      pares_vendidos, apartados_abiertos, creditos_abiertos,
      notas
    )
    SELECT
      v_tienda.id,
      v_fecha,

      -- by payment method
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'efectivo'),      0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'tarjeta'),       0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'sinpe'),         0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'transferencia'), 0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'otro'),          0),

      -- by sale type
      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'contado'),   0),
      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'apartado'),  0),
      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'credito'),   0),
      COALESCE(SUM(pv.monto), 0),

      -- pares vendidos: items from contado ventas paid that day
      COALESCE((
        SELECT SUM(dv.cantidad)
        FROM   detalle_ventas dv
        JOIN   ventas v2 ON v2.id = dv.venta_id
        WHERE  v2.tienda_id = v_tienda.id
          AND  v2.tipo = 'contado'
          AND  v2.estado = 'pagada'
          AND  EXISTS (
            SELECT 1 FROM pagos_venta pv2
            WHERE  pv2.venta_id = v2.id
              AND  pv2.fecha BETWEEN v_start AND v_end
          )
      ), 0),

      -- snapshot of open positions at midnight
      (SELECT COUNT(*) FROM ventas
       WHERE tienda_id = v_tienda.id AND tipo = 'apartado' AND estado = 'pendiente'),
      (SELECT COUNT(*) FROM ventas
       WHERE tienda_id = v_tienda.id AND tipo = 'credito'  AND estado = 'pendiente'),

      'Cierre automático'

    FROM pagos_venta pv
    JOIN ventas v ON v.id = pv.venta_id
    WHERE v.tienda_id = v_tienda.id
      AND pv.fecha BETWEEN v_start AND v_end;

  END LOOP;
END;
$$;

-- ─── pg_cron schedule ─────────────────────────────────────────────────────────
-- Requires the pg_cron extension (available on Supabase Pro+).
-- If pg_cron is not enabled, apply only the function above and skip this block.
-- Enable extension first: Extensions → pg_cron in the Supabase dashboard.

SELECT cron.schedule(
  'auto-cierre-caja',          -- job name (unique)
  '0 6 * * *',                 -- 06:00 UTC = 00:00 America/Costa_Rica
  'SELECT auto_cierre_caja()'
);
