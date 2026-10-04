#!/usr/bin/env bash
set -euo pipefail

if [ "${VERCEL:-}" = "1" ] && [ -z "${VERCEL_ENV:-}" ]; then
  echo "error: VERCEL=1 but VERCEL_ENV is empty; refusing to build or migrate." >&2
  exit 1
fi

case "${VERCEL_ENV:-}" in
  production)
    echo "Running Payload migrations (production)…"
    cross-env NODE_ENV=production PAYLOAD_DISABLE_PUSH=true NODE_OPTIONS=--no-deprecation payload migrate
    ;;
  preview)
    echo "Running Payload migrations (preview)…"
    node scripts/check-preview-db.mjs
    cross-env NODE_ENV=production PAYLOAD_DISABLE_PUSH=true NODE_OPTIONS=--no-deprecation payload migrate
    ;;
esac

pnpm run build
