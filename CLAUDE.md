# CalzaTrack — CLAUDE.md

You are a **Senior Full-Stack Engineer** working on CalzaTrack, a multi-store CRM and inventory management system for a family-owned footwear retail business in Costa Rica. You have deep expertise in React, TypeScript, and Supabase. You write clean, maintainable, production-quality code.

---

## Project Overview

**CalzaTrack** is an internal CRM for managing two shoe stores belonging to the same family. Each store has its own inventory and invoices, but they share a single client database. An admin user can see both stores and their combined analytics.

**Business context:**
- Two physical shoe stores (Tienda Papá, Tienda Mamá) in Costa Rica
- Currency: Costa Rican Colones (₡ CRC)
- Payment methods: Efectivo, Tarjeta, SINPE Móvil, Transferencia
- VAT (IVA): 13% standard rate in Costa Rica
- No public registration — access is invitation-only

**Core modules:**
1. **Dashboard** — KPIs por tienda y globales
2. **Inventario** — Productos por tienda (CRUD completo)
3. **Facturas** — Creación y gestión de facturas
4. **Clientes** — Directorio compartido entre tiendas
5. **Analíticas** — Comparativo de ventas, tendencias, stock bajo

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Build tool | Vite 5 |
| Routing | React Router v6 |
| Styling | Tailwind CSS v3 |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Charts | Recharts |
| Backend | Supabase (Postgres + Auth + RLS) |
| Package manager | pnpm |

---

## Project Structure

```
src/
├── components/
│   ├── ui/          # Reusable atomic components (Button, Input, Modal, Table...)
│   ├── layout/      # AppLayout, Sidebar, Header
│   ├── auth/        # Auth-specific components
│   ├── inventory/   # Inventory-specific components
│   ├── invoices/    # Invoice-specific components
│   ├── clients/     # Client-specific components
│   └── analytics/   # Analytics-specific components
├── hooks/           # Custom React hooks
├── lib/
│   ├── supabase.ts  # Supabase client singleton
│   └── utils.ts     # cn(), formatCRC(), formatDate()...
├── pages/           # Page-level components (one per route)
│   ├── auth/
│   ├── dashboard/
│   ├── inventory/
│   ├── invoices/
│   ├── clients/
│   └── analytics/
├── store/           # Zustand stores
├── types/           # TypeScript interfaces and types
└── utils/           # Pure utility functions
supabase/
└── migrations/      # SQL migration files (numbered)
```

---

## Database Schema

### Tables

**tiendas** — The two physical stores
```sql
id, nombre, descripcion, direccion, telefono, created_at
```

**profiles** — Extends auth.users
```sql
id (FK → auth.users), nombre, apellido, rol (admin|vendedor), tienda_id (FK → tiendas, nullable for admin), created_at
```

**categorias_producto** — Shoe categories
```sql
id, nombre (ej: Zapatos, Botas, Sandalias, Tenis, Mocasines), created_at
```

**productos** — Per-store inventory
```sql
id, tienda_id, codigo (SKU, unique per store), nombre, descripcion,
marca, categoria_id, genero (hombre|mujer|nino|nina|unisex),
talla, color, precio_costo, precio_venta, stock, stock_minimo,
imagen_url, activo, created_at, updated_at
```

**clientes** — Shared across stores
```sql
id, nombre, apellido, telefono, email, notas, created_at, updated_at
```

**facturas** — Per-store invoices
```sql
id, tienda_id, cliente_id (nullable), numero_factura (unique per store),
fecha, subtotal, impuesto (13% IVA), descuento, total,
estado (pendiente|pagada|cancelada|anulada),
metodo_pago (efectivo|tarjeta|sinpe|transferencia|otro),
notas, vendedor_id, created_at, updated_at
```

**factura_items** — Invoice line items
```sql
id, factura_id (CASCADE DELETE), producto_id, cantidad,
precio_unitario, descuento_item, subtotal, created_at
```

### Key Business Rules
- `(tienda_id, codigo)` is unique in productos — same SKU can exist in both stores
- `(tienda_id, numero_factura)` is unique in facturas
- Stock decrements automatically when a factura is marked as `pagada`
- Stock restores when a `pagada` factura is `anulada`
- IVA is 13% — calculate as `subtotal * 0.13`
- Admin role has access to all tiendas; vendedor only to their assigned tienda_id

### RLS Strategy
- `profiles`: users can read/update their own row; admin can read all
- `tiendas`: authenticated users can read; only admin can write
- `productos`: filtered by `tienda_id = auth.jwt() ->> 'tienda_id'` for vendedores; admin bypasses
- `facturas`: same tienda_id filter
- `clientes`: all authenticated users can CRUD
- `factura_items`: cascades from factura access

---

## Development Commands

```bash
pnpm dev          # Start dev server (http://localhost:5173)
pnpm build        # TypeScript check + Vite build
pnpm preview      # Preview production build
pnpm lint         # Run ESLint
```

---

## Code Standards

### TypeScript
- Strict mode enabled — no `any`, no `as unknown`
- All component props typed with explicit interfaces
- Use `type` for unions/primitives, `interface` for object shapes
- Export types from `src/types/index.ts`

### React
- Functional components only — no class components
- Custom hooks for all data fetching logic (never fetch directly in components)
- Use TanStack Query for all server state — don't use `useEffect` for data fetching
- Zustand for client-only global state (auth, active store selection)
- Zod schemas validate all form data before submission

### Styling
- Tailwind utility classes only — no CSS modules, no inline styles
- Use `cn()` from `@/lib/utils` for conditional class merging
- Brand color palette: `brand-{50..900}` (indigo-based)
- Responsive: mobile-first, sidebar collapses on small screens (future)

### Supabase
- All queries go through the singleton in `src/lib/supabase.ts`
- RLS is the security layer — never trust client-side role checks alone
- Use `.select()` with explicit columns — avoid `select('*')` in production queries
- Migrations are numbered SQL files in `supabase/migrations/`

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts`, prefixed with `use`
- Utilities/lib: `camelCase.ts`
- Types: defined in `src/types/index.ts`

### Error Handling
- Supabase errors bubble up through TanStack Query — handle at the query level
- Show user-friendly Spanish-language error messages (this is a Spanish-language UI)
- Use `react-hot-toast` for transient notifications
- Form errors shown inline via React Hook Form

---

## Patterns to Follow

### Data fetching hook pattern
```typescript
// hooks/useProductos.ts
export function useProductos(tiendaId: string, search?: string) {
  return useQuery({
    queryKey: ['productos', tiendaId, search],
    queryFn: () => fetchProductos(tiendaId, search),
    enabled: !!tiendaId,
  })
}
```

### Mutation pattern
```typescript
const mutation = useMutation({
  mutationFn: (data: CreateProductoData) => createProducto(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['productos'] })
    toast.success('Producto creado correctamente')
  },
  onError: () => toast.error('Error al crear el producto'),
})
```

### Component structure
```typescript
// Props interface at top
interface ProductCardProps {
  producto: Producto
  onEdit: (id: string) => void
}

// Named export (no default exports for components)
export function ProductCard({ producto, onEdit }: ProductCardProps) {
  // ...
}
```

---

## Environment Variables

Required in `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Never commit `.env` files. The `.env.example` file shows what variables are needed.

---

## Git Workflow

- `main` — production-ready code only
- `develop` — integration branch
- `feat/[feature-name]` — feature branches
- `fix/[bug-description]` — bug fix branches

Commit message format: `type(scope): description`
Examples: `feat(inventory): add product search filter`, `fix(auth): handle expired session`

---

## Supabase Project

- Project name: CalzaTrack
- Region: (configured in dashboard)
- Always run `pnpm build` before deploying to verify no TypeScript errors
- Migrations must be applied in order — never modify an already-applied migration, create a new one

---

## What NOT to do

- No `console.log` in production code
- No hardcoded store names (use the `tiendas` table)
- No direct DOM manipulation
- No `any` type — use proper generics or `unknown`
- No registration flow — users are created by admin in Supabase dashboard
- No mock data in production code
- Don't skip RLS — every table must have RLS enabled with appropriate policies
