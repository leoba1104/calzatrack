-- Migration 029: owner puede eliminar empleados e inventario_tienda de su propia tienda
--
-- El rol owner es "admin a nivel de su tienda" — ya podía hacer DELETE en
-- productos, variantes_producto, clientes y proveedores scoped a su tienda_id
-- (migraciones 023, 024, 025). empleados e inventario_tienda se quedaron
-- restringidos a admin únicamente; se alinean aquí al mismo patrón.
--
-- ventas / detalle_ventas / pagos_venta se dejan intencionalmente sin tocar:
-- el respaldo contable nunca se borra vía DELETE, solo se archiva
-- (ventas.archivado). marcas / categorias tampoco: son catálogo global sin
-- tienda_id, no hay forma de scoping por tienda.

DROP POLICY IF EXISTS "empleados_delete" ON empleados;
CREATE POLICY "empleados_delete"
  ON empleados FOR DELETE TO authenticated
  USING (
    auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  );

DROP POLICY IF EXISTS "inventario_delete" ON inventario_tienda;
CREATE POLICY "inventario_delete"
  ON inventario_tienda FOR DELETE TO authenticated
  USING (
    auth_role() = 'admin'
    OR (auth_role() = 'owner' AND tienda_id = auth_tienda_id())
  );