-- CalzaTrack — Schema completo v2
-- Ejecutar primero. Requiere una base de datos limpia.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TIENDAS
-- ============================================================
CREATE TABLE tiendas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  direccion   TEXT,
  telefono    TEXT,
  prefijo     TEXT NOT NULL,         -- Código 3 letras para número de venta: MAR, DAL
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- PROFILES (extiende auth.users — maneja login y roles)
-- ============================================================
CREATE TABLE profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre     TEXT,
  apellido   TEXT,
  rol        TEXT NOT NULL DEFAULT 'employee'
               CHECK (rol IN ('admin', 'owner', 'employee')),
  tienda_id  UUID REFERENCES tiendas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- EMPLEADOS (catálogo — quién atendió la venta, sin login propio)
-- ============================================================
CREATE TABLE empleados (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id  UUID REFERENCES tiendas(id) ON DELETE SET NULL,
  nombre     TEXT NOT NULL,
  apellido   TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- CATÁLOGO DE PRODUCTOS
-- ============================================================
CREATE TABLE marcas (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE categorias (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Información base del producto (sin talla/color — eso va en variantes)
CREATE TABLE productos (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  marca_id     UUID REFERENCES marcas(id) ON DELETE SET NULL,
  precio_base  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_base >= 0),
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Variante = combinación única talla+color con su propio SKU y precio
CREATE TABLE variantes_producto (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL UNIQUE,
  talla       TEXT,                    -- nullable: bolsos/accesorios no tienen talla
  color       TEXT,
  precio      NUMERIC(12, 2) NOT NULL CHECK (precio >= 0),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Stock de cada variante por tienda
CREATE TABLE inventario_tienda (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id   UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  variante_id UUID NOT NULL REFERENCES variantes_producto(id) ON DELETE CASCADE,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (tienda_id, variante_id)
);

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE clientes (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre                TEXT NOT NULL,
  apellido              TEXT,
  telefono              TEXT,
  email                 TEXT,
  identificacion_fiscal TEXT,          -- Cédula, cédula jurídica, DIMEX, etc.
  notas                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- VENTAS (encabezado de la venta/factura)
-- ============================================================
--
-- Estados:
--   borrador  → venta en progreso, sin afectar stock
--   apartado  → cliente pagó parcial, producto reservado (descuenta stock)
--   credito   → producto entregado, pago pendiente (descuenta stock)
--   pagada    → completamente pagada (descuenta stock)
--   anulada   → cancelada (restaura stock si estaba en apartado/credito/pagada)
--
CREATE TABLE ventas (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_venta  TEXT NOT NULL,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  tienda_id     UUID NOT NULL REFERENCES tiendas(id) ON DELETE RESTRICT,
  empleado_id   UUID REFERENCES empleados(id) ON DELETE SET NULL,
  estado        TEXT NOT NULL DEFAULT 'pagada'
                  CHECK (estado IN ('borrador', 'apartado', 'credito', 'pagada', 'anulada')),
  subtotal      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  impuesto      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (impuesto >= 0),
  descuento     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (tienda_id, numero_venta)
);

-- Líneas de la venta
CREATE TABLE detalle_ventas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id        UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  variante_id     UUID NOT NULL REFERENCES variantes_producto(id) ON DELETE RESTRICT,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
  descuento_item  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (descuento_item >= 0),
  subtotal        NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Pagos individuales (para apartados y créditos con pagos parciales)
CREATE TABLE pagos_venta (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id    UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  monto       NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  tipo_pago   TEXT NOT NULL
                CHECK (tipo_pago IN ('efectivo', 'tarjeta', 'sinpe', 'transferencia', 'otro')),
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- PROVEEDORES Y COMPRAS
-- ============================================================
CREATE TABLE proveedores (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_empresa TEXT NOT NULL,
  telefono       TEXT,
  email          TEXT,
  contacto       TEXT,                 -- Nombre del vendedor/contacto
  notas          TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Compra a proveedor (orden de compra / factura del proveedor)
CREATE TABLE compras (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_factura_proveedor TEXT,
  fecha                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proveedor_id             UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  tienda_id                UUID NOT NULL REFERENCES tiendas(id) ON DELETE RESTRICT,
  estado                   TEXT NOT NULL DEFAULT 'recibida'
                             CHECK (estado IN ('pendiente', 'recibida', 'anulada')),
  total_pagado             NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_pagado >= 0),
  notas                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at               TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE detalle_compras (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  compra_id      UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  variante_id    UUID NOT NULL REFERENCES variantes_producto(id) ON DELETE RESTRICT,
  cantidad       INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario NUMERIC(12, 2) NOT NULL CHECK (costo_unitario >= 0),
  subtotal       NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- SECUENCIAS DE NÚMERO DE VENTA (una por tienda)
-- ============================================================
CREATE TABLE ventas_secuencias (
  tienda_id UUID REFERENCES tiendas(id) ON DELETE CASCADE PRIMARY KEY,
  siguiente INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_empleados_tienda       ON empleados(tienda_id);
CREATE INDEX idx_variantes_producto     ON variantes_producto(producto_id);
CREATE INDEX idx_inventario_tienda      ON inventario_tienda(tienda_id);
CREATE INDEX idx_inventario_variante    ON inventario_tienda(variante_id);
CREATE INDEX idx_ventas_tienda          ON ventas(tienda_id);
CREATE INDEX idx_ventas_fecha           ON ventas(tienda_id, fecha DESC);
CREATE INDEX idx_ventas_estado          ON ventas(tienda_id, estado);
CREATE INDEX idx_ventas_cliente         ON ventas(cliente_id);
CREATE INDEX idx_detalle_ventas_venta   ON detalle_ventas(venta_id);
CREATE INDEX idx_pagos_venta            ON pagos_venta(venta_id);
CREATE INDEX idx_compras_tienda         ON compras(tienda_id);
CREATE INDEX idx_compras_proveedor      ON compras(proveedor_id);
CREATE INDEX idx_detalle_compras        ON detalle_compras(compra_id);
CREATE INDEX idx_clientes_nombre        ON clientes(nombre, apellido);
CREATE INDEX idx_clientes_fiscal        ON clientes(identificacion_fiscal);
