-- CalzaTrack — Initial Schema Migration
-- Run this in the Supabase SQL Editor

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Tiendas (stores)
CREATE TABLE tiendas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  direccion   TEXT,
  telefono    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- User profiles (extends auth.users)
CREATE TABLE profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre     TEXT,
  apellido   TEXT,
  rol        TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
  tienda_id  UUID REFERENCES tiendas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Product categories
CREATE TABLE categorias_producto (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Products (per store)
CREATE TABLE productos (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id    UUID REFERENCES tiendas(id) ON DELETE CASCADE NOT NULL,
  codigo       TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  marca        TEXT NOT NULL,
  categoria_id UUID REFERENCES categorias_producto(id) ON DELETE SET NULL,
  genero       TEXT CHECK (genero IN ('hombre', 'mujer', 'nino', 'nina', 'unisex')),
  talla        TEXT,
  color        TEXT,
  precio_costo NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  precio_venta NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo INTEGER NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
  imagen_url   TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (tienda_id, codigo)
);

-- Clients (shared across stores)
CREATE TABLE clientes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL,
  apellido   TEXT,
  telefono   TEXT,
  email      TEXT,
  notas      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Invoices (per store)
CREATE TABLE facturas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id       UUID REFERENCES tiendas(id) ON DELETE RESTRICT NOT NULL,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  numero_factura  TEXT NOT NULL,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subtotal        NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  impuesto        NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (impuesto >= 0),
  descuento       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total           NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'pagada', 'cancelada', 'anulada')),
  metodo_pago     TEXT CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'sinpe', 'transferencia', 'otro')),
  notas           TEXT,
  vendedor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (tienda_id, numero_factura)
);

-- Invoice line items
CREATE TABLE factura_items (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  factura_id     UUID REFERENCES facturas(id) ON DELETE CASCADE NOT NULL,
  producto_id    UUID REFERENCES productos(id) ON DELETE RESTRICT NOT NULL,
  cantidad       INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
  descuento_item  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (descuento_item >= 0),
  subtotal        NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- INVOICE NUMBER SEQUENCES (one per store, set up in app)
-- ============================================================
CREATE TABLE factura_secuencias (
  tienda_id  UUID REFERENCES tiendas(id) ON DELETE CASCADE PRIMARY KEY,
  siguiente  INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_productos_tienda      ON productos(tienda_id);
CREATE INDEX idx_productos_activo      ON productos(tienda_id, activo);
CREATE INDEX idx_productos_stock_bajo  ON productos(tienda_id, stock, stock_minimo);
CREATE INDEX idx_facturas_tienda       ON facturas(tienda_id);
CREATE INDEX idx_facturas_estado       ON facturas(tienda_id, estado);
CREATE INDEX idx_facturas_fecha        ON facturas(tienda_id, fecha DESC);
CREATE INDEX idx_facturas_cliente      ON facturas(cliente_id);
CREATE INDEX idx_factura_items_factura ON factura_items(factura_id);
CREATE INDEX idx_clientes_nombre       ON clientes(nombre, apellido);
CREATE INDEX idx_clientes_telefono     ON clientes(telefono);

-- ============================================================
-- TRIGGERS — updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_facturas_updated_at
  BEFORE UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER — Auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, nombre, apellido)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'nombre',
    NEW.raw_user_meta_data ->> 'apellido'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER — Stock management on invoice state change
-- ============================================================
CREATE OR REPLACE FUNCTION manage_stock_on_factura()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Decrement stock when factura becomes 'pagada'
  IF NEW.estado = 'pagada' AND OLD.estado != 'pagada' THEN
    UPDATE productos p
    SET stock = stock - fi.cantidad
    FROM factura_items fi
    WHERE fi.factura_id = NEW.id
      AND fi.producto_id = p.id;
  END IF;

  -- Restore stock when a 'pagada' factura is 'anulada'
  IF NEW.estado = 'anulada' AND OLD.estado = 'pagada' THEN
    UPDATE productos p
    SET stock = stock + fi.cantidad
    FROM factura_items fi
    WHERE fi.factura_id = NEW.id
      AND fi.producto_id = p.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manage_stock
  AFTER UPDATE OF estado ON facturas
  FOR EACH ROW EXECUTE FUNCTION manage_stock_on_factura();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Insert the two stores
INSERT INTO tiendas (nombre, descripcion) VALUES
  ('Tienda Papá',  'Primera tienda de calzado de la familia'),
  ('Tienda Mamá',  'Segunda tienda de calzado de la familia');

-- Seed invoice sequences
INSERT INTO factura_secuencias (tienda_id, siguiente)
SELECT id, 1 FROM tiendas;

-- Seed product categories
INSERT INTO categorias_producto (nombre) VALUES
  ('Zapatos'),
  ('Botas'),
  ('Sandalias'),
  ('Tenis'),
  ('Mocasines'),
  ('Zapatillas'),
  ('Deportivos'),
  ('Formales'),
  ('Casuales'),
  ('Infantil');
