# Catalog search providers

Free-tier search uses **`PostgresSearchProvider`** (`postgres-provider.ts`): PostgreSQL `tsvector` full-text search plus `pg_trgm` for typos and partial model/SKU matches.

A future **`TypesenseSearchProvider`** can implement the same `SearchProvider` interface (`provider.ts`) for hosted search. See `typesense-stub.ts`.
