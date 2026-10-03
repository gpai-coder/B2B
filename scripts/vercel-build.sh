#!/usr/bin/env bash
set -euo pipefail

if [ "${VERCEL:-}" = "1" ] && [ -z "${VERCEL_ENV:-}" ]; then
  echo "error: VERCEL=1 but VERCEL_ENV is empty; refusing to build or migrate." >&2
  exit 1
fi

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Running Payload migrations (production)…"
  cross-env NODE_ENV=production PAYLOAD_DISABLE_PUSH=true NODE_OPTIONS=--no-deprecation payload migrate
fi

pnpm run build
