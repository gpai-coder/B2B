---
name: verify-b2b-portal
description: Launch the B2B ordering portal locally (Docker Postgres + migrate/seed + Next dev), run doctor checks, drive vendor catalog/PDP and Payload admin staff UI with Playwright, capture proof artifacts, and clean up. Use after storefront, catalog, commerce, or admin changes; pair with /poteto-mode for rigorous builds.
---

# verify-b2b-portal

Drive the real app the way vendors and staff do. **Never** point verification at production Neon without passing `scripts/check-preview-db.mjs`. **Never** weaken preview DB fingerprint guards or log full `DATABASE_URL` values.

## Launch

From repo root, with Docker available:

```bash
export VERIFY_RUN_ID="verify-$(date +%Y%m%d-%H%M%S)"
mkdir -p "artifacts/verify-b2b-portal/${VERIFY_RUN_ID}"
node scripts/verify-b2b-portal/launch.mjs | tee "artifacts/verify-b2b-portal/${VERIFY_RUN_ID}/launch.log"
```

Launch:

1. Ensures `.env.local` exists (copies `.env.example`, generates `PAYLOAD_SECRET` if needed).
2. `docker compose up -d postgres` and waits for `pg_isready`.
3. `PAYLOAD_DISABLE_PUSH=true pnpm db:migrate` and `pnpm db:seed`.
4. Starts `pnpm dev` on `http://127.0.0.1:3000` unless `/api/health` already reports `db: connected`.

Ready when `GET /api/health` returns HTTP 200 and `"db":"connected"`.

Default credentials: `.env.example` (`SEED_VENDOR_A_*`, `SEED_ADMIN_*`).

## Doctor

```bash
node scripts/verify-b2b-portal/doctor.mjs
```

Confirms:

- `DATABASE_URL` is set.
- For **non-local** hosts, `node scripts/check-preview-db.mjs` passes (preview/prod isolation — same guard as Vercel preview migrate).
- `/api/health` shows database connected.

Run doctor after launch and before every drive script if anything failed mid-run.

## Drive

Read `.cursor/skills/verify-b2b-portal/features/README.md` and pick the feature file(s) that match your change. Helpers (same `VERIFY_RUN_ID` as launch):

```bash
# Vendor catalog → typeahead → PDP
node scripts/verify-b2b-portal/drive-catalog.mjs

# Staff Payload admin login → Users collection
node scripts/verify-b2b-portal/drive-admin.mjs
```

Prefer `data-testid` and roles from the feature map. For broader regression, optional:

```bash
PAYLOAD_DISABLE_PUSH=true pnpm test:e2e tests/e2e/catalog-search.spec.ts tests/e2e/admin-csp.spec.ts
```

(Playwright config starts its own webServer when nothing is listening; avoid two dev servers on port 3000.)

## Evidence

Proof directory: `artifacts/verify-b2b-portal/<VERIFY_RUN_ID>/`

| Artifact | Proves |
| --- | --- |
| `launch.log` | migrate/seed/dev readiness |
| `01-catalog-after-login.png` | vendor auth + catalog |
| `02-catalog-typeahead.png` | search suggest |
| `03-product-pdp.png` | PDP render |
| `04-admin-dashboard.png` | staff admin session |
| `05-admin-users-list.png` | admin collections navigation |
| `catalog-drive.log`, `admin-drive.log` | command transcript |

Attach screenshots and a one-line doctor result to PR descriptions. Do not delete artifacts in cleanup.

## Cleanup

Stops only the dev server this run started (PID file). Leaves Docker Postgres up for faster reruns.

```bash
node scripts/verify-b2b-portal/cleanup.mjs
```

Confirm evidence files still exist under `artifacts/verify-b2b-portal/<VERIFY_RUN_ID>/` after cleanup.

## Helpers

| Script | Purpose |
| --- | --- |
| `scripts/verify-b2b-portal/launch.mjs` | Postgres + migrate/seed + dev |
| `scripts/verify-b2b-portal/doctor.mjs` | isolation + health preflight |
| `scripts/verify-b2b-portal/drive-catalog.mjs` | vendor catalog journey |
| `scripts/verify-b2b-portal/drive-admin.mjs` | Payload admin journey |
| `scripts/verify-b2b-portal/cleanup.mjs` | stop dev started by launch |

## Isolation

- Local verification must use Docker Postgres (`DATABASE_URL=postgresql://portal:portal@127.0.0.1:5432/b2b_portal`).
- Remote `DATABASE_URL` values require `node scripts/check-preview-db.mjs` to exit 0 before migrate or drive.
- Do not set preview/production Neon URLs in `.env.local` for agent verification unless isolation is proven.

Maintain the feature map with `/maintain-verification-skill` when user paths change.
