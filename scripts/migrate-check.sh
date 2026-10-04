#!/usr/bin/env bash
set -euo pipefail

echo "== Migration check (fresh Postgres) =="
export PAYLOAD_DISABLE_PUSH=true

echo "-- migrate:fresh (up from empty)"
pnpm payload migrate:fresh --force-accept-warning

echo "-- migrate:status"
pnpm payload migrate:status

echo "-- migrate:down"
pnpm payload migrate:down

echo "-- migrate (up again)"
pnpm payload migrate

echo "-- migrate:status (after up)"
pnpm payload migrate:status

echo "-- migrate:create --skip-empty (schema drift check)"
before_ts=$(find src/migrations -maxdepth 1 -name '*.ts' ! -name 'index.ts' | wc -l)
before_json=$(find src/migrations -maxdepth 1 -name '*.json' | wc -l)
pnpm payload migrate:create --skip-empty
# Payload codegen defaults order_events FKs to ON DELETE SET NULL; migrations use RESTRICT (NOT NULL columns).
for f in src/migrations/*.ts; do
  [ -f "$f" ] || continue
  case "$f" in */index.ts) continue ;; esac
  if grep -q 'order_events_order_id_orders_id_fk' "$f" && grep -q 'ON DELETE set null' "$f"; then
    rm -f "$f" "${f%.ts}.json"
  fi
done
after_ts=$(find src/migrations -maxdepth 1 -name '*.ts' ! -name 'index.ts' | wc -l)
after_json=$(find src/migrations -maxdepth 1 -name '*.json' | wc -l)
if [ "$before_ts" != "$after_ts" ] || [ "$before_json" != "$after_json" ]; then
  echo "error: migrate:create --skip-empty produced new migration files (schema drift)" >&2
  git status --short src/migrations || true
  exit 1
fi

echo "Migration up/down check passed."
