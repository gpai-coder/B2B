#!/usr/bin/env bash
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Running Payload migrations (production)…"
  cross-env NODE_ENV=production PAYLOAD_DISABLE_PUSH=true NODE_OPTIONS=--no-deprecation payload migrate
fi

pnpm run build
