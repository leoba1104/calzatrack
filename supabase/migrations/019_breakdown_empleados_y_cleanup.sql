-- Migration 019: persist employee breakdown in cierres_caja
-- Also updates auto_cierre_caja to include it.
-- Cleanup of contado ventas after cierre is handled in the frontend.

ALTER TABLE cierres_caja
  ADD COLUMN IF NOT EXISTS breakdown_empleados JSONB NOT NULL DEFAULT '[]';

-- Update auto_cierre_caja to persist employee breakdown
CREATE OR REPLACE FUNCTION auto_cierre_caja()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tienda      RECORD;
  v_fecha       DATE;
  v_day_start   TIMESTAMPTZ;
  v_day_end     TIMESTAMPTZ;
  v_last_cierre TIMESTAMPTZ;
  v_desde       TIMESTAMPTZ;
BEGIN
  v_fecha     := (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE - 1;
  v_day_start := v_fecha::TIMESTAMPTZ AT TIME ZONE 'America/Costa_Rica';
  v_day_end   := (v_fecha + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Costa_Rica' - INTERVAL '1 microsecond';

  FOR v_tienda IN SELECT id FROM tiendas LOOP

    SELECT created_at INTO v_last_cierre
    FROM cierres_caja
    WHERE tienda_id = v_tienda.id AND fecha = v_fecha
    ORDER BY created_at DESC LIMIT 1;

    v_desde := COALESCE(v_last_cierre, v_day_start);

    IF NOT EXISTS (
      SELECT 1 FROM pagos_venta pv
      JOIN ventas v ON v.id = pv.venta_id
      WHERE v.tienda_id = v_tienda.id
        AND pv.fecha > v_desde AND pv.fecha <= v_day_end
    ) THEN CONTINUE; END IF;

    INSERT INTO cierres_caja (
      tienda_id, fecha, desde,
      efectivo, tarjeta, sinpe, transferencia, otro,
      total_contado, total_apartados, total_creditos, total_dia,
      categorias_totales, breakdown_empleados,
      pares_vendidos, apartados_abiertos, creditos_abiertos, notas
    )
    SELECT
      v_tienda.id, v_fecha, v_desde,

      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'efectivo'),      0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'tarjeta'),       0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'sinpe'),         0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'transferencia'), 0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'otro'),          0),

      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'contado'),  0),
      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'apartado'), 0),
      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'credito'),  0),
      COALESCE(SUM(pv.monto), 0),

      -- Dynamic category breakdown
      (
        SELECT COALESCE(jsonb_object_agg(cvc.slug, COALESCE(sums.cat_sum, 0)), '{}')
        FROM categorias_venta_contado cvc
        LEFT JOIN (
          SELECT v2.categoria_venta, SUM(pv2.monto) AS cat_sum
          FROM pagos_venta pv2
          JOIN ventas v2 ON v2.id = pv2.venta_id
          WHERE v2.tienda_id = v_tienda.id AND v2.tipo = 'contado'
            AND pv2.fecha > v_desde AND pv2.fecha <= v_day_end
          GROUP BY v2.categoria_venta
        ) sums ON sums.categoria_venta = cvc.slug
        WHERE cvc.activo = true
      ),

      -- Employee breakdown
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('nombre', emp_nombre, 'total', emp_total)
          ORDER BY emp_total DESC
        ), '[]')
        FROM (
          SELECT
            COALESCE(e.nombre || COALESCE(' ' || e.apellido, ''), 'Sin asignar') AS emp_nombre,
            SUM(pv2.monto) AS emp_total
          FROM pagos_venta pv2
          JOIN ventas v2 ON v2.id = pv2.venta_id
          LEFT JOIN empleados e ON e.id = v2.empleado_id
          WHERE v2.tienda_id = v_tienda.id
            AND pv2.fecha > v_desde AND pv2.fecha <= v_day_end
          GROUP BY e.nombre, e.apellido
        ) emp_sums
      ),

      COALESCE((
        SELECT SUM(dv.cantidad)
        FROM detalle_ventas dv
        JOIN ventas v2 ON v2.id = dv.venta_id
        WHERE v2.tienda_id = v_tienda.id AND v2.tipo = 'contado' AND v2.estado = 'pagada'
          AND EXISTS (
            SELECT 1 FROM pagos_venta pv2
            WHERE pv2.venta_id = v2.id AND pv2.fecha > v_desde AND pv2.fecha <= v_day_end
          )
      ), 0),

      (SELECT COUNT(*) FROM ventas WHERE tienda_id = v_tienda.id AND tipo = 'apartado' AND estado = 'pendiente'),
      (SELECT COUNT(*) FROM ventas WHERE tienda_id = v_tienda.id AND tipo = 'credito'  AND estado != 'pagada'),

      'Cierre automático'

    FROM pagos_venta pv
    JOIN ventas v ON v.id = pv.venta_id
    WHERE v.tienda_id = v_tienda.id
      AND pv.fecha > v_desde AND pv.fecha <= v_day_end;

  END LOOP;
END;
$$;
