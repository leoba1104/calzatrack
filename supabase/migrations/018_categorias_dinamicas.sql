-- Migration 018: dynamic contado categories
-- Creates categorias_venta_contado table and migrates cierres_caja
-- from hardcoded fixed columns to a JSONB categorias_totales field.

-- 1. Category table
CREATE TABLE IF NOT EXISTS categorias_venta_contado (
  id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug    VARCHAR(30)  NOT NULL UNIQUE,
  nombre  VARCHAR(50)  NOT NULL,
  color   VARCHAR(20)  NOT NULL DEFAULT 'gray',
  orden   SMALLINT     NOT NULL DEFAULT 0,
  activo  BOOLEAN      NOT NULL DEFAULT true
);

ALTER TABLE categorias_venta_contado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cvc_select" ON categorias_venta_contado
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cvc_write" ON categorias_venta_contado
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
  );

INSERT INTO categorias_venta_contado (slug, nombre, color, orden) VALUES
  ('hombre',  'Hombre',  'blue',   1),
  ('mujer',   'Mujer',   'pink',   2),
  ('nino',    'Niño',    'green',  3),
  ('fajas',   'Fajas',   'orange', 4),
  ('bolsos',  'Bolsos',  'purple', 5),
  ('ofertas', 'Ofertas', 'red',    6);

-- 2. Add JSONB breakdown column to cierres_caja
ALTER TABLE cierres_caja
  ADD COLUMN IF NOT EXISTS categorias_totales JSONB NOT NULL DEFAULT '{}';

-- 3. Backfill existing rows from fixed columns
UPDATE cierres_caja
SET categorias_totales = jsonb_build_object(
  'hombre',  total_hombre,
  'mujer',   total_mujer,
  'nino',    total_nino,
  'fajas',   total_fajas,
  'bolsos',  total_bolsos,
  'ofertas', total_ofertas
);

-- 4. Drop old fixed columns
ALTER TABLE cierres_caja
  DROP COLUMN IF EXISTS total_hombre,
  DROP COLUMN IF EXISTS total_mujer,
  DROP COLUMN IF EXISTS total_nino,
  DROP COLUMN IF EXISTS total_fajas,
  DROP COLUMN IF EXISTS total_bolsos,
  DROP COLUMN IF EXISTS total_ofertas;

-- 5. Update auto_cierre_caja to aggregate categories dynamically from the table
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
    ORDER BY created_at DESC
    LIMIT 1;

    v_desde := COALESCE(v_last_cierre, v_day_start);

    IF NOT EXISTS (
      SELECT 1 FROM pagos_venta pv
      JOIN ventas v ON v.id = pv.venta_id
      WHERE v.tienda_id = v_tienda.id
        AND pv.fecha > v_desde
        AND pv.fecha <= v_day_end
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO cierres_caja (
      tienda_id, fecha, desde,
      efectivo, tarjeta, sinpe, transferencia, otro,
      total_contado, total_apartados, total_creditos, total_dia,
      categorias_totales,
      pares_vendidos, apartados_abiertos, creditos_abiertos,
      notas
    )
    SELECT
      v_tienda.id,
      v_fecha,
      v_desde,

      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'efectivo'),      0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'tarjeta'),       0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'sinpe'),         0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'transferencia'), 0),
      COALESCE(SUM(pv.monto) FILTER (WHERE pv.tipo_pago = 'otro'),          0),

      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'contado'),   0),
      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'apartado'),  0),
      COALESCE(SUM(pv.monto) FILTER (WHERE v.tipo = 'credito'),   0),
      COALESCE(SUM(pv.monto), 0),

      -- Dynamic category breakdown: reads slugs from categorias_venta_contado
      (
        SELECT COALESCE(jsonb_object_agg(cvc.slug, COALESCE(sums.cat_sum, 0)), '{}')
        FROM categorias_venta_contado cvc
        LEFT JOIN (
          SELECT v2.categoria_venta, SUM(pv2.monto) AS cat_sum
          FROM pagos_venta pv2
          JOIN ventas v2 ON v2.id = pv2.venta_id
          WHERE v2.tienda_id = v_tienda.id
            AND v2.tipo = 'contado'
            AND pv2.fecha > v_desde
            AND pv2.fecha <= v_day_end
          GROUP BY v2.categoria_venta
        ) sums ON sums.categoria_venta = cvc.slug
        WHERE cvc.activo = true
      ),

      COALESCE((
        SELECT SUM(dv.cantidad)
        FROM detalle_ventas dv
        JOIN ventas v2 ON v2.id = dv.venta_id
        WHERE v2.tienda_id = v_tienda.id
          AND v2.tipo = 'contado'
          AND v2.estado = 'pagada'
          AND EXISTS (
            SELECT 1 FROM pagos_venta pv2
            WHERE pv2.venta_id = v2.id
              AND pv2.fecha > v_desde
              AND pv2.fecha <= v_day_end
          )
      ), 0),

      (SELECT COUNT(*) FROM ventas WHERE tienda_id = v_tienda.id AND tipo = 'apartado' AND estado = 'pendiente'),
      (SELECT COUNT(*) FROM ventas WHERE tienda_id = v_tienda.id AND tipo = 'credito'  AND estado != 'pagada'),

      'Cierre automático'

    FROM pagos_venta pv
    JOIN ventas v ON v.id = pv.venta_id
    WHERE v.tienda_id = v_tienda.id
      AND pv.fecha > v_desde
      AND pv.fecha <= v_day_end;

  END LOOP;
END;
$$;
