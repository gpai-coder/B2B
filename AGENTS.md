# Agent instructions (B2B ordering portal)

Read this before editing `gpai-coder/B2B`. Full rationale: `docs/agent-friendly-rearchitecture-plan.md`.

## Stack

Next.js App Router + Payload 3 + Neon Postgres + Vercel Blob. Deploy via Vercel (`vercel-build` → migrate guards → `next build`).

## One supported way per task

| Task | Do this | Do not |
| --- | --- | --- |
| Cart, checkout, quotes, pricing for orders | `getCommerce()` from `@/commerce` | `getPayload` / `payload.update` in storefront actions |
| Catalog PLP / PDP / search page data | `@/lib/catalog/read-models` | Ad-hoc `payload.find` with varying `depth` in pages |
| Vendor-visible media bytes | `@/lib/media` facade + `/api/vendor/media` | New blob URL builders in components |
| Auth / vendor gate | `@/lib/session`, `@/lib/vendor-portal`, `@/lib/access/vendor-gate` | Duplicate approval checks |
| Access control rules | `src/access` + collection hooks | One-off `overrideAccess: true` in UI |
| Schema changes | SQL migrations + `pnpm db:migrate` (`PAYLOAD_DISABLE_PUSH=true`) | Drizzle push against prod-like DBs |
| Deploy / migrate | `scripts/vercel-build.sh` only | Extra migrate paths in `package.json` without tests |

**Staff workflows:** Payload admin only (`app/(payload)/admin`). Do not add custom staff storefront routes unless product explicitly requests them.

## Import boundaries

- `app/(frontend)/**` must not import `getPayload` from `payload` (ESLint enforced). Use commerce or catalog read-models.
- `src/commerce/**` may use Payload internally; UI must not bypass commerce for writes.
- `src/lib/search/**` owns migration-backed columns (`search_vector`); see `src/lib/search/README.md`.

## PR checklist (agents)

1. **Single concern** — one work unit per PR; no stacked features from parallel branches.
2. **Migrations** — if you touch schema, include Payload SQL migration + CI passes `db:migrate:check`.
3. **Tests** — run `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`; integration/e2e when touching flows they cover.
4. **No prod shortcuts** — never weaken `check-preview-db.mjs` or `PAYLOAD_DISABLE_PUSH` in CI.
5. **Review** — human review expected; do not self-merge unless owner autopilot policy applies.

## Common failure classes (avoid)

1. CI/E2E that does not match production build (`pnpm build` before e2e).
2. Preview deploy migrating production Neon (fingerprint guard must stay).
3. Duplicate blob/media read paths (PDP 500s, CDN cache mistakes).
4. Cart/quote races — use `commerce/cart-serialized` and existing int tests.
5. PLP vs search pricing drift — share pricing resolution, not copy-paste SQL.

## Local commands

```bash
pnpm install
docker compose up -d postgres
cp .env.example .env.local
pnpm db:migrate && pnpm db:seed
pnpm dev
pnpm typecheck && pnpm lint && pnpm test:unit
```
