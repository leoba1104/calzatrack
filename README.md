# CalzaTrack

**Internal CRM and multi-store inventory system for two family-owned shoe stores in Costa Rica** (*Zapatería Mariana* and *Zapatería Dali*). In daily production use.

🔗 **Live:** [calzatrack.vercel.app](https://calzatrack.vercel.app) *(invite-only)*

Each store manages its own inventory, sales, clients and suppliers; an `admin` user sees both stores and their combined analytics.

Access is **invite-only** — there is no public sign-up. Users are created from the Supabase dashboard.

## Highlights

- **Security in the database, not the UI:** Postgres Row-Level Security scopes every table by store and role.
- **Transactional sales:** a single RPC validates role/store, recalculates prices server-side, locks stock with `FOR UPDATE` and writes the sale atomically.
- **Thermal receipt printing from the browser** over WebUSB (ESC/POS), plus PDF export.
- **Automatic nightly cash-register close** scheduled with `pg_cron`.
- **CI/CD:** lint, tests and build on every PR; database migrations applied automatically by GitHub Actions; Vercel deploys.

## Modules

| Module | Route | Description |
|---|---|---|
| Dashboard | `/` | Daily KPIs, store notes (sticky-note board) |
| Inventory | `/inventory` | Products with variants (size/color/SKU), per-store stock, sale prices, bulk import |
| Sales | `/sales` | Cash sales with category, discount and receipt printing |
| Layaways | `/layaways` | Reservations with partial payments (stock is deducted on creation) |
| Credits | `/credits` | Credit sales to registered clients, overdue tracking |
| Clients | `/clients` | Per-store client directory |
| Employees | `/employees` | Staff catalog (who handled each sale) + users with login |
| Suppliers | `/suppliers` | Per-store supplier directory |
| Purchases | `/purchases` | Purchase orders with free-text lines and a photo of the invoice |
| Analytics | `/analytics` | Sales comparison, trends, low stock (admin/owner) |
| Reports | `/reports` | Manual and automatic cash-register closings (pg_cron at Costa Rica midnight) |

> The UI is in Spanish for the stores' staff; code, files and routes are in English.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite 5 |
| Routing | React Router v6 |
| Styling | Tailwind CSS v3 (purple `brand` palette) |
| Server state | TanStack Query v5 |
| Client state | Zustand (with partial persistence) |
| Forms | React Hook Form + Zod |
| Backend | Supabase (Postgres 17 + Auth + RLS + Storage + pg_cron) |
| Package manager | pnpm |

## Requirements

- Node.js 18+ and [pnpm](https://pnpm.io) (`npm i -g pnpm`)
- A [Supabase](https://supabase.com) project
- Chrome or Edge to use the thermal printer (WebUSB is not available in Firefox/Safari)

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase project values (Dashboard → Settings → API):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

> Never put the `service_role` key in this file: everything prefixed with `VITE_` is embedded in the browser bundle. `.env.local` is in `.gitignore` and must not be committed.

### 3. Database

Apply the migrations in `supabase/migrations/` **in order** (`001` → latest). Two options:

```bash
# Option A — Supabase CLI
supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"

# Option B — paste each file, in order, into the dashboard SQL Editor
```

Notes:

- `004_seed.sql` creates both stores, categories, brands and sample data. At minimum, the `tiendas` and `ventas_secuencias` rows must exist before you can make a sale.
- `010_auto_cierre_caja.sql` schedules the automatic close with **pg_cron**. If the extension isn't enabled, the migration still applies but nothing is scheduled; enable pg_cron in Dashboard → Database → Extensions and then run:
  ```sql
  SELECT cron.schedule('auto-cierre-caja', '0 6 * * *', 'SELECT auto_cierre_caja()');
  ```
  (06:00 UTC = midnight in Costa Rica.)

### 4. Storage

Create a **private** `facturas-compra` bucket (Dashboard → Storage) for supplier invoice photos. Migration `027` sets the correct policies (INSERT/SELECT for `authenticated` only); the app stores the file path in `compras.factura_imagen_url` and generates signed URLs (`createSignedUrl`) to display it.

### 5. Users

There is no public sign-up. For each user:

1. Dashboard → Authentication → Users → **Invite user** (or Create user).
2. The `handle_new_user` trigger automatically creates their `profiles` row with the `employee` role.
3. Assign role and store in the `profiles` table:
   ```sql
   UPDATE profiles SET rol = 'owner', tienda_id = (SELECT id FROM tiendas WHERE prefijo = 'MAR')
   WHERE id = '<user-uuid>';
   ```
   - `admin`: sees both stores (leave `tienda_id` NULL)
   - `owner` / `employee`: require a `tienda_id`

Important — security settings in Authentication:

- Keep **public sign-up disabled** (Sign In / Up), since any account created gets an `authenticated` session.
- Enable **Leaked Password Protection** (Passwords → Prevent use of compromised passwords).

### 6. Run the app

```bash
pnpm dev        # http://localhost:5173
```

## Scripts

```bash
pnpm dev        # development server
pnpm build      # TypeScript check + production build (dist/)
pnpm preview    # serve the production build locally
pnpm lint       # ESLint
```

## Roles and permissions

| Role | Access |
|---|---|
| `admin` | Both stores, full management, global analytics; the only role that can delete sales/payments/employees |
| `owner` | Their store: inventory, sales, clients, employees, purchases, store analytics |
| `employee` | Their store: inventory and creating sales; the UI hides employees/analytics |

The real security lives in **RLS** (`supabase/migrations/002_rls.sql` and later): policies filter by the user profile's `tienda_id` (`auth_tienda_id()`) and by role (`auth_role()`). The `isAdmin` / `canManage` checks in the `useAuth` hook are UI conveniences only and must not be treated as a security boundary.

## Project structure

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
├── lib/             # supabase.ts (singleton client), utils.ts (cn, formatCRC...)
├── pages/           # one folder per route
├── store/           # authStore (Zustand)
├── types/           # shared types + web-usb.d.ts
└── utils/           # escpos.ts (ESC/POS receipt generation)
supabase/
└── migrations/      # numbered SQL migrations (never edit one that's been applied)
```

## Data model (summary)

- **productos** (per store) → **variantes_producto** (size/color/SKU/price/cost/sale price, with its own `tienda_id` since 025; SKU unique per store) → **inventario_tienda** (stock per store and variant).
- **ventas** has a `tipo` (`contado` cash | `apartado` layaway | `credito` credit) and an `estado` (`pendiente` | `pagada` | `anulada`); line items live in **detalle_ventas** and payments in **pagos_venta**.
- Sales are created through the transactional **`crear_venta`** RPC (migration 026): it validates role/store, recalculates prices from the database, locks stock with `FOR UPDATE` and creates the number, header, lines and initial payment in a single transaction.
- Sequential sale numbers per store: `MAR-00001`, `DAL-00001` (`get_next_numero_venta` over `ventas_secuencias`).
- Stock is deducted when a sale is created (all three types); voiding a sale restores it (`trg_stock_on_venta` trigger).
- **cierres_caja** stores aggregated snapshots (by payment method, category and employee) and is immutable (only admin can edit). After a close, the captured sales are marked `archivado = true` — details are kept as an accounting record.
- **clientes** and **proveedores** are per store since migration 024.
- `impuesto` is recorded as 0: sale prices include VAT and it isn't broken out on the receipt.

## CI/CD

- `.github/workflows/ci.yml` runs lint, tests and build on every PR and on pushes to `main`/`develop`. Vercel deploys (`main` → Production, `develop`/PRs → Preview).
- `.github/workflows/migrate.yml` automatically applies new migrations on pushes to `main` that touch `supabase/migrations/**`. It requires the **`SUPABASE_DB_URL`** secret (database connection string) in GitHub → Settings → Secrets and variables → Actions.

To deploy the frontend elsewhere, serve `dist/` (Vercel, Netlify, etc.) with the two `VITE_*` variables set in the build environment.

## Thermal printer

The "Conectar impresora" (Connect printer) button in the sidebar uses WebUSB: once an ESC/POS printer is authorized, Chrome/Edge remembers it and the app reconnects automatically on startup. Sale and cash-close receipts are generated in `src/utils/escpos.ts`.

## Code conventions

- Functional components with named exports; types in `src/types/index.ts`.
- Data always goes through TanStack Query (never `useEffect` + fetch); mutations invalidate their query keys.
- Plain Tailwind with `cn()` for conditional classes; shared form controls from `src/components/ui/`.
- Files/folders/routes in English; UI text in Spanish.
- Commits: `type(scope): description` (e.g. `feat(inventory): add product search filter`).
