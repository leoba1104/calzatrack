export type UserRole = 'admin' | 'owner' | 'employee'

export type VentaTipo   = 'contado' | 'apartado' | 'credito'
export type VentaEstado = 'pendiente' | 'pagada' | 'anulada'

export type MetodoPago = 'efectivo' | 'tarjeta' | 'sinpe' | 'transferencia' | 'otro'

export interface Tienda {
  id: string
  nombre: string
  descripcion: string | null
  direccion: string | null
  telefono: string | null
  prefijo: string
  activo: boolean
  created_at: string
}

export interface Profile {
  id: string
  nombre: string | null
  apellido: string | null
  rol: UserRole
  tienda_id: string | null
  tienda?: Tienda
  created_at: string
}

export interface Empleado {
  id: string
  tienda_id: string | null
  tienda?: Tienda
  nombre: string
  apellido: string | null
  telefono: string | null
  email: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Marca {
  id: string
  nombre: string
  created_at: string
}

export interface Categoria {
  id: string
  nombre: string
  created_at: string
}

export interface Producto {
  id: string
  nombre: string
  descripcion: string | null
  categoria_id: string | null
  categoria?: Categoria
  marca_id: string | null
  marca?: Marca
  precio_base: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface VarianteProducto {
  id: string
  producto_id: string
  producto?: Producto
  sku: string
  talla: string | null
  color: string | null
  precio: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface InventarioTienda {
  id: string
  tienda_id: string
  variante_id: string
  variante?: VarianteProducto
  stock: number
  updated_at: string
}

export interface Cliente {
  id: string
  nombre: string
  apellido: string | null
  telefono: string | null
  email: string | null
  identificacion_fiscal: string | null
  notas: string | null
  moroso: boolean
  created_at: string
  updated_at: string
}

export interface DetalleVenta {
  id: string
  venta_id: string
  variante_id: string
  variante?: VarianteProducto
  cantidad: number
  precio_unitario: number
  descuento_item: number
  subtotal: number
  created_at: string
}

export interface PagoVenta {
  id: string
  venta_id: string
  empleado_id: string | null
  empleado?: Empleado
  fecha: string
  monto: number
  tipo_pago: MetodoPago
  notas: string | null
  created_at: string
}

export interface Venta {
  id: string
  numero_venta: string
  fecha: string
  cliente_id: string | null
  cliente?: Cliente
  tienda_id: string
  tienda?: Tienda
  empleado_id: string | null
  empleado?: Empleado
  tipo: VentaTipo
  estado: VentaEstado
  contacto_nombre:   string | null
  contacto_apellido: string | null
  contacto_telefono: string | null
  subtotal: number
  impuesto: number
  descuento: number
  total: number
  notas: string | null
  archivado: boolean
  pagos?: PagoVenta[]
  items?: DetalleVenta[]
  created_at: string
  updated_at: string
}

export interface Proveedor {
  id: string
  nombre_empresa: string
  telefono: string | null
  email: string | null
  contacto: string | null
  notas: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface DetalleCompra {
  id: string
  compra_id: string
  variante_id: string | null
  variante?: VarianteProducto
  producto_id: string | null
  producto?: Producto
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  subtotal: number
  created_at: string
}

export interface Compra {
  id: string
  numero_factura_proveedor: string | null
  fecha: string
  proveedor_id: string | null
  proveedor?: Proveedor
  tienda_id: string
  tienda?: Tienda
  estado: 'pendiente' | 'recibida' | 'anulada'
  total_pagado: number
  factura_imagen_url: string | null
  notas: string | null
  items?: DetalleCompra[]
  created_at: string
  updated_at: string
}

export interface CierreCaja {
  id: string
  tienda_id: string
  tienda?: Tienda
  fecha: string
  efectivo: number
  tarjeta: number
  sinpe: number
  transferencia: number
  otro: number
  total_contado: number
  total_apartados: number
  total_creditos: number
  total_dia: number
  pares_vendidos: number
  apartados_abiertos: number
  creditos_abiertos: number
  notas: string | null
  cerrado_por: string | null
  cerrado_por_profile?: { nombre: string | null; apellido: string | null }
  created_at: string
}
