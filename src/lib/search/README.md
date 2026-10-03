# Catalog search providers

Free-tier search uses **`PostgresSearchProvider`** (`postgres-provider.ts`): PostgreSQL `tsvector` full-text search plus `pg_trgm` for typos and partial model/SKU matches. Queries run through Payload’s Postgres adapter (`payload.db.execute` + Drizzle `sql` templates) with bound parameters only.

## Migration-owned columns

`products.search_vector`, GIN/trgm indexes, and refresh triggers are created in SQL migrations (`20261003_120000_catalog_search.ts` and follow-ups). They are **not** Payload collection fields.

- Run schema changes with **`pnpm db:migrate`** (`PAYLOAD_DISABLE_PUSH=true`). Do not rely on Drizzle **push** against a database that has search migrations applied: push can drop columns that are absent from the generated Payload schema (including `search_vector`).
- Local/tests already set `PAYLOAD_DISABLE_PUSH=true` in `vitest.setup.ts` and CI.

`catalog_hidden` is a normal Payload field on `products` and is included in the migration JSON snapshot `20261003_120000_catalog_search.json` so `migrate:create` does not re-add it.

## Hidden catalog products (Delancey)

Products with `catalogHidden: true` are excluded from PLP and search but remain reachable at `/products/[slug]` for spec and parts documentation. Discontinued variants still render on the PDP without contract pricing or ordering.

A future **`TypesenseSearchProvider`** can implement the same `SearchProvider` interface (`provider.ts`) for hosted search. See `typesense-stub.ts`.
