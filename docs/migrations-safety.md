# Migration safety (Payload + SQL)

## Rules

1. **Never Drizzle-push production-like databases** — use `pnpm db:migrate` with `PAYLOAD_DISABLE_PUSH=true`.
2. **SQL-owned columns** live only in Payload SQL migrations (see `src/lib/search/README.md` for `search_vector` / triggers). Do not add matching Payload collection fields for migration-only columns unless the migration JSON snapshot requires it.
3. **CI and tests** always set `PAYLOAD_DISABLE_PUSH=true` before migrate, seed, build, and E2E.
4. **Vercel** runs migrations only via `scripts/vercel-build.sh` (production + preview with `check-preview-db.mjs`).

## Adding schema

```bash
# local
export PAYLOAD_DISABLE_PUSH=true
pnpm db:migrate
pnpm db:migrate:check
```

Ship the new files under `src/migrations/` and register in `src/migrations/index.ts`.

## Related docs

- Catalog search columns: `src/lib/search/README.md`
- Preview vs prod DB: README § Preview deployments + `scripts/check-preview-db.mjs`
