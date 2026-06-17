export type UserRole = 'admin' | 'vendedor'

export type ProductoGenero = 'hombre' | 'mujer' | 'nino' | 'nina' | 'unisex'

export type FacturaEstado = 'pendiente' | 'pagada' | 'cancelada' | 'anulada'

export type MetodoPago = 'efectivo' | 'tarjeta' | 'sinpe' | 'transferencia' | 'otro'

export interface Tienda {
  id: string
  nombre: string
  descripcion: string | null
  direccion: string | null
  telefono: string | null
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

export interface CategoriaProducto {
  id: string
  nombre: string
  created_at: string
}

export interface Producto {
  id: string
  tienda_id: string
  tienda?: Tienda
  codigo: string
  nombre: string
  descripcion: string | null
  marca: string
  categoria_id: string | null
  categoria?: CategoriaProducto
  genero: ProductoGenero | null
  talla: string | null
  color: string | null
  precio_costo: number
  precio_venta: number
  stock: number
  stock_minimo: number
  imagen_url: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Cliente {
  id: string
  nombre: string
  apellido: string | null
  telefono: string | null
  email: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface FacturaItem {
  id: string
  factura_id: string
  producto_id: string
  producto?: Producto
  cantidad: number
  precio_unitario: number
  descuento_item: number
  subtotal: number
  created_at: string
}

export interface Factura {
  id: string
  tienda_id: string
  tienda?: Tienda
  cliente_id: string | null
  cliente?: Cliente
  numero_factura: string
  fecha: string
  subtotal: number
  impuesto: number
  descuento: number
  total: number
  estado: FacturaEstado
  metodo_pago: MetodoPago | null
  notas: string | null
  vendedor_id: string | null
  vendedor?: Profile
  items?: FacturaItem[]
  created_at: string
  updated_at: string
}

export interface VentaResumen {
  tienda_id: string
  tienda_nombre: string
  total_ventas: number
  total_facturas: number
  fecha: string
}
