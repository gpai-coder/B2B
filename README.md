# B2B Ordering Portal (Foundations)

B2B ordering portal for LIXIL-style plumbing products (faucets, fixtures, toilets). Vendors browse a catalog, see customer-specific prices, and place orders (including against quotes). **Version 1** is self-contained on Postgres; a later version swaps pricing/quotes/orders to MuleSoft/SAP via a single `src/commerce/` module.

## Stack

- **Next.js** (App Router, TypeScript strict)
- **Payload CMS** embedded in the same app
- **Postgres** via `@payloadcms/db-postgres` (Neon in production, Docker locally)
- **Vercel Blob** for uploads in production (local disk in dev when `BLOB_READ_WRITE_TOKEN` is unset)
- Deploy target: **Vercel**

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+
- Docker (for local Postgres)

## Local setup

1. **Clone and install**

   ```bash
   pnpm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local`:

   - Set `PAYLOAD_SECRET` to a long random string (`openssl rand -base64 32`).
   - `DATABASE_URL` defaults match `docker-compose.yml`.

   Required variables (validated at server startup via `src/env.ts`):

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | Postgres connection string |
   | `PAYLOAD_SECRET` | Payload auth/session secret (min 16 chars) |
   | `NEXT_PUBLIC_SERVER_URL` | Public app URL (optional but recommended) |
   | `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (production uploads; optional locally) |

3. **Start Postgres**

   ```bash
   docker compose up -d postgres
   ```

4. **Run the app**

   ```bash
   pnpm dev
   ```

   - Storefront: [http://localhost:3000](http://localhost:3000)
   - Payload admin: [http://localhost:3000/admin](http://localhost:3000/admin)

   On first admin visit, create an admin user — or run **`pnpm db:seed`** after Postgres is up to load demo companies, catalog, price lists, and a quote (see `.env.example` seed credentials; override in production).

5. **Quality checks**

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm format
   ```

## Production: Vercel + Neon + Blob

The repo owner configures these (not automated in CI):

1. **Vercel project** — Import the GitHub repo; framework preset **Next.js**.
2. **Neon (Postgres)** — In the Vercel dashboard: **Storage → Connect Database → Neon**. This sets `DATABASE_URL` (or `POSTGRES_URL`) on the project. Use the Neon connection string with `@payloadcms/db-postgres` (`DATABASE_URL` in this app).
3. **Payload secret** — Add `PAYLOAD_SECRET` in Vercel → Settings → Environment Variables (all environments). Generate with `openssl rand -base64 32`.
4. **Public URL** — Set `NEXT_PUBLIC_SERVER_URL` to the production URL (e.g. `https://your-app.vercel.app`).
5. **Vercel Blob** — Create a Blob store in Vercel Storage; add `BLOB_READ_WRITE_TOKEN` to env. Without it, dev uses local `media/` uploads only.
6. **Deploy** — Push to the connected branch. Vercel runs **`vercel-build`** (not plain `build`): **production** and **preview** run `payload migrate` with `PAYLOAD_DISABLE_PUSH=true`, then `next build`. Preview runs `scripts/check-preview-db.mjs` first so the preview `DATABASE_URL` fingerprint cannot match production (see `/api/health` `dbFingerprint` on the prod URL).

### Preview deployments and Neon (runbook)

Until every preview uses a dedicated Neon branch/database:

1. **Prefer isolated Neon** — Create a branch per preview or per developer in Neon; point the Vercel **Preview** environment `DATABASE_URL` at that branch (free tier supports branching).
2. **Guards (required today)** — `scripts/vercel-build.sh` calls `check-preview-db.mjs`, which compares preview DB fingerprints against production health (`PROD_HEALTH_URL`, default `https://b2b-gamma-seven.vercel.app/api/health`). Migrate aborts on a match.
3. **Verify after env changes** — `curl -sS "$PROD_HEALTH_URL/api/health"` and confirm preview `DATABASE_URL` resolves to a different fingerprint before merging migration PRs.
4. **Local check** — `node scripts/check-preview-db.mjs` with preview env vars (never log full connection strings).

Schema changes in repo should ship via Payload SQL migrations (`pnpm db:migrate` locally). Do not rely on Drizzle push against production; see `docs/migrations-safety.md` and `src/lib/search/README.md` for migration-owned columns such as `search_vector`.

Optional CLI (if linked): `vercel link`, `vercel env pull .env.local`.

## Project layout

```
src/
  app/(frontend)/   # Storefront routes
  app/(payload)/    # Payload admin + REST/GraphQL
  collections/      # Payload collections (Companies, Products, Variants, …)
  env.ts              # Zod env validation
  payload.config.ts
```

### Data model (Payload collections)

| Collection | Purpose |
| --- | --- |
| `companies` | B2B vendor accounts; optional `sapCustomerNumber`; `accountApproved` gate |
| `users` | Auth users with `role` (admin, sales, vendor-buyer), optional `company`, `approved` |
| `products` / `product-variants` | Catalog with SKU, finish, structured specs, images, spec/install PDFs |
| `price-lists` | Standard or company-specific prices with optional quantity breaks and validity dates |
| `quotes` | Per-company quotes with line SKU/qty/price, status, expiry |
| `orders` | Draft → submitted lifecycle, ship-to, PO, optional quote, idempotency key |

Schema changes apply via Payload migrations (`pnpm db:migrate` with `PAYLOAD_DISABLE_PUSH=true`). Production Vercel deploys run pending migrations automatically before `next build` (see **Deploy** above). Local `pnpm dev` may use adapter push when push is enabled; CI and tests set `PAYLOAD_DISABLE_PUSH=true`.

Uploads use **local disk** (`/media`) when `BLOB_READ_WRITE_TOKEN` is unset; enable `@payloadcms/storage-vercel-blob` in production.

## Commerce module

All pricing, quote, and order reads/writes go through **`src/commerce/`** (`getPrices`, `createDraftOrder`, `submitOrder`, `getOrder`, `listQuotes`, `getQuote`). V1 uses Postgres via Payload; swap the implementation later for MuleSoft/SAP without changing callers.

- Health check: `GET /api/health` (DB connectivity + app version)
- Vendor UI: `/login`, `/catalog`, quote conversion at `/quotes/[quoteNumber]/order`

## PR plan (foundations)

1. **App skeleton** (this baseline) — Next.js + Payload, lint/format, env schema, README
2. **Data model** — Companies, Products, Variants, PriceLists, Quotes, Orders
3. **Auth & seed** — Roles, access control, approval gate, seed script
4. **Commerce module** — `src/commerce/` interface + Postgres impl, health API, E2E smoke test, CI

Do not merge via agent; review each PR independently.
