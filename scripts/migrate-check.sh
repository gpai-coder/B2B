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

echo "Migration up/down check passed."
