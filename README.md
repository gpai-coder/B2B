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

   On first admin visit, create an admin user. Seed data arrives in a later PR.

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
6. **Deploy** — Push to the connected branch; Vercel runs `pnpm build`.

Optional CLI (if linked): `vercel link`, `vercel env pull .env.local`.

## Project layout

```
src/
  app/(frontend)/   # Storefront routes
  app/(payload)/    # Payload admin + REST/GraphQL
  collections/      # Payload collections (expanded in PR 2+)
  env.ts              # Zod env validation
  payload.config.ts
```

## PR plan (foundations)

1. **App skeleton** (this baseline) — Next.js + Payload, lint/format, env schema, README
2. **Data model** — Companies, Products, Variants, PriceLists, Quotes, Orders
3. **Auth & seed** — Roles, access control, approval gate, seed script
4. **Commerce module** — `src/commerce/` interface + Postgres impl, health API, E2E smoke test, CI

Do not merge via agent; review each PR independently.
