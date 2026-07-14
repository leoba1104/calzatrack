# CalzaTrack

CRM interno e inventario multi-tienda para dos zapaterías familiares en Costa Rica (**Zapatería Mariana** y **Zapatería Dali**). Cada tienda maneja su propio inventario, ventas, clientes y proveedores; un usuario `admin` ve ambas tiendas y sus analíticas combinadas.

El acceso es **solo por invitación** — no existe registro público. Los usuarios se crean desde el dashboard de Supabase.

## Módulos

| Módulo | Ruta | Descripción |
|---|---|---|
| Dashboard | `/` | KPIs del día, notas de tienda (pizarra de post-its) |
| Inventario | `/inventory` | Productos con variantes (talla/color/SKU), stock por tienda, ofertas, importación masiva |
| Ventas | `/sales` | Ventas de contado con categoría, descuento e impresión de tiquete |
| Apartados | `/layaways` | Reservas con abonos parciales (descuentan stock al crearse) |
| Créditos | `/credits` | Ventas a crédito a clientes registrados, control de morosidad |
| Clientes | `/clients` | Directorio de clientes por tienda |
| Empleados | `/employees` | Catálogo de personal (quién atendió la venta) + usuarios con login |
| Proveedores | `/suppliers` | Directorio de proveedores por tienda |
| Compras | `/purchases` | Órdenes de compra con líneas de texto libre y foto de la factura |
| Analíticas | `/analytics` | Comparativo de ventas, tendencias, stock bajo (admin/owner) |
| Reportes | `/reports` | Cierres de caja manuales y automáticos (pg_cron a medianoche CR) |

Extras: impresión directa de tiquetes en impresoras térmicas ESC/POS vía **WebUSB** (requiere Chrome o Edge) y exportación a PDF con jsPDF.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite 5 |
| Routing | React Router v6 |
| Estilos | Tailwind CSS v3 (paleta `brand` morada) |
| Estado servidor | TanStack Query v5 |
| Estado cliente | Zustand (con persistencia parcial) |
| Formularios | React Hook Form + Zod |
| Backend | Supabase (Postgres 17 + Auth + RLS + Storage + pg_cron) |
| Gestor de paquetes | pnpm |

## Requisitos

- Node.js 18+ y [pnpm](https://pnpm.io) (`npm i -g pnpm`)
- Un proyecto de [Supabase](https://supabase.com)
- Chrome o Edge si se usa la impresora térmica (WebUSB no existe en Firefox/Safari)

## Puesta en marcha

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Variables de entorno

Copiar `.env.example` a `.env.local` y completar con los datos del proyecto de Supabase (Dashboard → Settings → API):

```
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

> Nunca pongas la `service_role` key en este archivo: todo lo que empieza con `VITE_` se incrusta en el bundle del navegador. `.env.local` está en `.gitignore` y no debe commitearse.

### 3. Base de datos

Aplicar las migraciones de `supabase/migrations/` **en orden** (`001` → `027`). Dos opciones:

```bash
# Opción A — Supabase CLI
supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"

# Opción B — pegar cada archivo en orden en el SQL Editor del dashboard
```

Notas:

- `004_seed.sql` crea las dos tiendas, categorías, marcas y datos de ejemplo. Es requisito mínimo que existan las filas de `tiendas` y `ventas_secuencias` para poder vender.
- `010_auto_cierre_caja.sql` programa el cierre automático con **pg_cron**. Si la extensión no está habilitada, la migración aplica igual pero sin agendar; habilitar pg_cron en Dashboard → Database → Extensions y luego ejecutar:
  ```sql
  SELECT cron.schedule('auto-cierre-caja', '0 6 * * *', 'SELECT auto_cierre_caja()');
  ```
  (06:00 UTC = medianoche en Costa Rica.)

### 4. Storage

Crear el bucket `facturas-compra` (Dashboard → Storage) **privado**, para las fotos de facturas de proveedor. La migración `027` deja las políticas correctas (INSERT/SELECT solo para `authenticated`); la app guarda el path del archivo en `compras.factura_imagen_url` y genera URLs firmadas (`createSignedUrl`) al mostrarlo.

### 5. Usuarios

No hay registro público. Para cada usuario:

1. Dashboard → Authentication → Users → **Invite user** (o Create user).
2. El trigger `handle_new_user` crea automáticamente su fila en `profiles` con rol `employee`.
3. Asignar rol y tienda en la tabla `profiles`:
   ```sql
   UPDATE profiles SET rol = 'owner', tienda_id = (SELECT id FROM tiendas WHERE prefijo = 'MAR')
   WHERE id = '<uuid-del-usuario>';
   ```
   - `admin`: ve ambas tiendas (deja `tienda_id` en NULL)
   - `owner` / `employee`: requieren `tienda_id`

Importante — ajustes de seguridad en Authentication:

- Mantener **deshabilitado el signup público** (Sign In / Up), ya que cualquier cuenta creada obtiene sesión `authenticated`.
- Activar **Leaked Password Protection** (Passwords → Prevent use of compromised passwords).

### 6. Correr la app

```bash
pnpm dev        # http://localhost:5173
```

## Scripts

```bash
pnpm dev        # servidor de desarrollo
pnpm build      # verificación de TypeScript + build de producción (dist/)
pnpm preview    # sirve el build de producción localmente
pnpm lint       # ESLint
```

## Roles y permisos

| Rol | Acceso |
|---|---|
| `admin` | Ambas tiendas, gestión completa, analíticas globales, único que puede borrar ventas/pagos/empleados |
| `owner` | Su tienda: inventario, ventas, clientes, empleados, compras, analíticas de su tienda |
| `employee` | Su tienda: inventario y creación de ventas; la UI le oculta empleados/analíticas |

La seguridad real vive en **RLS** (`supabase/migrations/002_rls.sql` y posteriores): las políticas filtran por `tienda_id` del perfil del usuario (`auth_tienda_id()`) y por rol (`auth_role()`). Los checks `isAdmin` / `canManage` del hook `useAuth` son solo de conveniencia para la UI y no deben tratarse como frontera de seguridad.

## Estructura

```
src/
├── components/
│   ├── ui/          # Input, Select, Textarea, DatePicker, Modal, FormField...
│   ├── layout/      # AppLayout, Sidebar, Header
│   ├── inventory/   # ProductModal, VarianteModal, BulkImportModal
│   ├── sales/       # SaleModal, SaleDetailModal
│   ├── layaways/    # LayawayDetailModal
│   ├── credits/     # CreditDetailModal
│   ├── purchases/   # PurchaseModal, CompraDetailModal
│   ├── reports/     # CierreCajaModal
│   └── clients/     # ClientModal
├── hooks/           # useAuth, usePrinter (WebUSB), useEmployees...
├── lib/             # supabase.ts (cliente singleton), utils.ts (cn, formatCRC...)
├── pages/           # una carpeta por ruta
├── store/           # authStore (Zustand)
├── types/           # tipos compartidos + web-usb.d.ts
└── utils/           # escpos.ts (generación de tiquetes ESC/POS)
supabase/
└── migrations/      # SQL numerado 001–024 (nunca editar una migración aplicada)
```

## Modelo de datos (resumen)

- **productos** (por tienda) → **variantes_producto** (talla/color/SKU/precio/costo/oferta, con `tienda_id` propio desde la 025; SKU único por tienda) → **inventario_tienda** (stock por tienda y variante).
- **ventas** tiene `tipo` (`contado` | `apartado` | `credito`) y `estado` (`pendiente` | `pagada` | `anulada`); las líneas van en **detalle_ventas** y los abonos en **pagos_venta**.
- Las ventas se crean con la RPC transaccional **`crear_venta`** (migración 026): valida rol/tienda, recalcula precios desde la BD, bloquea stock con `FOR UPDATE` y crea número + encabezado + líneas + pago inicial en una sola transacción.
- Números de venta correlativos por tienda: `MAR-00001`, `DAL-00001` (`get_next_numero_venta` sobre `ventas_secuencias`).
- Stock: se descuenta al crear la venta (los tres tipos); anular restaura (trigger `trg_stock_on_venta`).
- **cierres_caja** guarda snapshots agregados (por método de pago, categoría y empleado) y son inmutables (solo admin puede editarlos). Tras un cierre, las ventas capturadas se marcan `archivado = true` — el detalle se conserva como respaldo contable.
- **clientes** y **proveedores** son por tienda desde la migración 024.
- El `impuesto` se registra en 0: los precios de venta son IVA-incluido y no se desglosa en el tiquete.

## CI/CD

`.github/workflows/migrate.yml` aplica automáticamente las migraciones nuevas al hacer push a `main` que toque `supabase/migrations/**`. Requiere el secret **`SUPABASE_DB_URL`** (connection string de la BD) en GitHub → Settings → Secrets and variables → Actions.

Para desplegar el frontend basta con servir `dist/` (Vercel, Netlify, etc.) definiendo las dos variables `VITE_*` en el entorno de build.

## Impresora térmica

El botón "Conectar impresora" del sidebar usa WebUSB: al autorizar una impresora ESC/POS una vez, Chrome/Edge la recuerda y la app se reconecta sola al iniciar. Los tiquetes de venta y de cierre de caja se generan en `src/utils/escpos.ts`.

## Convenciones de código

- Componentes funcionales con named exports; tipos en `src/types/index.ts`.
- Datos siempre vía TanStack Query (nunca `useEffect` + fetch); mutaciones invalidan sus query keys.
- Tailwind puro con `cn()` para clases condicionales; controles de formulario compartidos de `src/components/ui/`.
- Archivos/carpetas/rutas en inglés; textos de UI en español.
- Commits: `type(scope): descripción` (ej. `feat(inventory): add product search filter`).
