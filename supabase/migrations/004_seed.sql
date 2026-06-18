-- CalzaTrack — Datos de prueba
-- Ejecutar DESPUÉS de 003_functions.sql
--
-- NOTA: Los triggers de stock solo disparan en UPDATE de estado.
-- Como los INSERTs de seed ya insertan en estado final,
-- el stock se gestiona manualmente aquí.

-- ============================================================
-- TIENDAS
-- ============================================================
INSERT INTO tiendas (nombre, descripcion, direccion, prefijo) VALUES
  ('Zapatería Mariana', 'Tienda de calzado de Mariana', 'San José, Costa Rica',  'MAR'),
  ('Zapatería Dali',    'Tienda de calzado de Dali',    'Heredia, Costa Rica',   'DAL');

INSERT INTO ventas_secuencias (tienda_id, siguiente)
SELECT id, 1 FROM tiendas;

-- ============================================================
-- EMPLEADOS (catálogo, sin login)
-- ============================================================
INSERT INTO empleados (tienda_id, nombre, apellido) VALUES
  ((SELECT id FROM tiendas WHERE prefijo = 'MAR'), 'Mariana', 'González'),
  ((SELECT id FROM tiendas WHERE prefijo = 'DAL'), 'Dali',    'Rodríguez');

-- ============================================================
-- CATÁLOGO
-- ============================================================
INSERT INTO marcas (nombre) VALUES
  ('Nike'), ('Adidas'), ('Skechers'), ('Timberland'), ('Crocs'), ('Sin Marca');

INSERT INTO categorias (nombre) VALUES
  ('Calzado'), ('Botas'), ('Sandalias'), ('Tenis'), ('Mocasines'),
  ('Zapatillas'), ('Deportivos'), ('Formales'), ('Casuales'), ('Infantil'),
  ('Bolsos'), ('Accesorios');

-- ============================================================
-- PROVEEDOR
-- ============================================================
INSERT INTO proveedores (nombre_empresa, telefono, contacto) VALUES
  ('Distribuidora Central CR', '2222-3333', 'Juan Méndez');

-- ============================================================
-- PRODUCTO: Tenis Clásico Blanco Nike — 2 variantes (talla 38, 40)
-- ============================================================
INSERT INTO productos (nombre, descripcion, categoria_id, marca_id, precio_base)
VALUES (
  'Tenis Clásico Blanco',
  'Tenis casual unisex, liviano y transpirable',
  (SELECT id FROM categorias WHERE nombre = 'Tenis'),
  (SELECT id FROM marcas WHERE nombre = 'Nike'),
  35000.00
);

INSERT INTO variantes_producto (producto_id, sku, talla, color, precio) VALUES
  ((SELECT id FROM productos WHERE nombre = 'Tenis Clásico Blanco'), 'NIKE-TCB-38', '38', 'Blanco', 35000.00),
  ((SELECT id FROM productos WHERE nombre = 'Tenis Clásico Blanco'), 'NIKE-TCB-40', '40', 'Blanco', 35000.00);

-- ============================================================
-- COMPRA: Proveedor → Zapatería Mariana (5 talla 38, 3 talla 40)
-- ============================================================
INSERT INTO compras (numero_factura_proveedor, proveedor_id, tienda_id, estado, total_pagado, notas)
VALUES (
  'PROV-2025-001',
  (SELECT id FROM proveedores WHERE nombre_empresa = 'Distribuidora Central CR'),
  (SELECT id FROM tiendas WHERE prefijo = 'MAR'),
  'recibida',
  112000.00,
  'Pedido inicial de tenis blancos'
);

INSERT INTO detalle_compras (compra_id, variante_id, cantidad, costo_unitario, subtotal)
VALUES
  (
    (SELECT id FROM compras WHERE numero_factura_proveedor = 'PROV-2025-001'),
    (SELECT id FROM variantes_producto WHERE sku = 'NIKE-TCB-38'),
    5, 14000.00, 70000.00
  ),
  (
    (SELECT id FROM compras WHERE numero_factura_proveedor = 'PROV-2025-001'),
    (SELECT id FROM variantes_producto WHERE sku = 'NIKE-TCB-40'),
    3, 14000.00, 42000.00
  );

-- Stock manual (el trigger solo dispara en UPDATE, no en INSERT)
INSERT INTO inventario_tienda (tienda_id, variante_id, stock) VALUES
  ((SELECT id FROM tiendas WHERE prefijo = 'MAR'), (SELECT id FROM variantes_producto WHERE sku = 'NIKE-TCB-38'), 5),
  ((SELECT id FROM tiendas WHERE prefijo = 'MAR'), (SELECT id FROM variantes_producto WHERE sku = 'NIKE-TCB-40'), 3);

-- ============================================================
-- CLIENTE
-- ============================================================
INSERT INTO clientes (nombre, apellido, telefono, identificacion_fiscal) VALUES
  ('Carlos', 'Mora Jiménez', '8888-7777', '112345678');

-- ============================================================
-- VENTA: 1 par de tenis talla 38, pagado en efectivo
-- ============================================================
INSERT INTO ventas (numero_venta, fecha, cliente_id, tienda_id, empleado_id, estado, subtotal, impuesto, total)
VALUES (
  'MAR-00001',
  NOW(),
  (SELECT id FROM clientes WHERE identificacion_fiscal = '112345678'),
  (SELECT id FROM tiendas WHERE prefijo = 'MAR'),
  (SELECT id FROM empleados WHERE nombre = 'Mariana'),
  'pagada',
  35000.00,
  4550.00,   -- 13% IVA
  39550.00
);

INSERT INTO detalle_ventas (venta_id, variante_id, cantidad, precio_unitario, descuento_item, subtotal)
VALUES (
  (SELECT id FROM ventas WHERE numero_venta = 'MAR-00001'),
  (SELECT id FROM variantes_producto WHERE sku = 'NIKE-TCB-38'),
  1, 35000.00, 0.00, 35000.00
);

-- Pago registrado
INSERT INTO pagos_venta (venta_id, empleado_id, monto, tipo_pago)
VALUES (
  (SELECT id FROM ventas WHERE numero_venta = 'MAR-00001'),
  (SELECT id FROM empleados WHERE nombre = 'Mariana'),
  39550.00,
  'efectivo'
);

-- Descontar stock manualmente (trigger solo dispara en UPDATE de estado)
UPDATE inventario_tienda
SET stock = stock - 1
WHERE tienda_id   = (SELECT id FROM tiendas WHERE prefijo = 'MAR')
  AND variante_id = (SELECT id FROM variantes_producto WHERE sku = 'NIKE-TCB-38');

-- Avanzar secuencia para que la siguiente venta sea MAR-00002
UPDATE ventas_secuencias
SET siguiente = 2
WHERE tienda_id = (SELECT id FROM tiendas WHERE prefijo = 'MAR');
