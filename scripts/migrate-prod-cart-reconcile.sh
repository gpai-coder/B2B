#!/usr/bin/env bash
set -euo pipefail

echo "== Legacy preview cart migration reconcile test =="
export PAYLOAD_DISABLE_PUSH=true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "error: DATABASE_URL is required" >&2
  exit 1
fi

INDEX_BACKUP="$(mktemp)"
CART_MIGRATION_STASH="$(mktemp -d)"
cp src/migrations/index.ts "$INDEX_BACKUP"

cleanup() {
  cp "$INDEX_BACKUP" src/migrations/index.ts
  rm -f "$INDEX_BACKUP"
  if [ -f "$CART_MIGRATION_STASH/20261003_134743.ts" ]; then
    mv "$CART_MIGRATION_STASH/20261003_134743.ts" "$CART_MIGRATION_STASH/20261003_134743.json" src/migrations/
  fi
  rmdir "$CART_MIGRATION_STASH" 2>/dev/null || rm -rf "$CART_MIGRATION_STASH"
}
trap cleanup EXIT

mv src/migrations/20261003_134743.ts src/migrations/20261003_134743.json "$CART_MIGRATION_STASH/"
cp scripts/fixtures/migrations-index-f4170a8.ts src/migrations/index.ts

echo "-- migrate:fresh at f4170a8 migration set"
pnpm payload migrate:fresh --force-accept-warning

echo "-- apply legacy preview cart SQL + migration row (prod preview state)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/fixtures/20261004_120000_cart_moq.up.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
INSERT INTO payload_migrations (name, batch, created_at, updated_at)
VALUES ('20261004_120000_cart_moq', 99, now(), now());
"

echo "-- seed catalog (current app code expects carts locked-doc rel column)"
pnpm db:seed

mv "$CART_MIGRATION_STASH/20261003_134743.ts" "$CART_MIGRATION_STASH/20261003_134743.json" src/migrations/
cp "$INDEX_BACKUP" src/migrations/index.ts

echo "-- migrate forward with reconcile guard"
pnpm db:migrate

if psql "$DATABASE_URL" -tAc "SELECT 1 FROM payload_migrations WHERE name='20261004_120000_cart_moq'" | grep -q 1; then
  echo "error: legacy migration row was not removed" >&2
  exit 1
fi

if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM payload_migrations WHERE name='20261003_134743'" | grep -q 1; then
  echo "error: canonical cart migration did not run" >&2
  exit 1
fi

if [ "$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.carts_lines')")" != "carts_lines" ]; then
  echo "error: carts_lines missing after reconcile migrate" >&2
  exit 1
fi

if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_indexes WHERE indexname = 'payload_locked_documents_rels_carts_id_idx'" | grep -q 1; then
  echo "error: payload_locked_documents_rels_carts_id_idx missing after reconcile" >&2
  exit 1
fi

echo "Legacy cart migration reconcile test passed."
