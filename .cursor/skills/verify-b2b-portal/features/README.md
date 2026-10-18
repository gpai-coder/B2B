# B2B portal verification map

Read this index before driving the app. Each feature file is a user-path recipe for `verify-b2b-portal`.

## Baseline preconditions

- `VERIFY_RUN_ID` set; `node scripts/verify-b2b-portal/launch.mjs` completed.
- `node scripts/verify-b2b-portal/doctor.mjs` exits 0.
- Seed data from `pnpm db:seed` (vendor **Pacific Plumbing**, SKU `7353101`, admin `admin@local.test`).
- App at `http://127.0.0.1:3000` with `PAYLOAD_DISABLE_PUSH=true` for any migrate step.

## Driving conventions

- Use Playwright helpers in `scripts/verify-b2b-portal/drive-*.mjs` or match their selectors in manual browser runs.
- Prefer `data-testid` and accessible names from this map.
- Restore mutated data after tests that create rows; catalog/admin smoke scripts are read-only.

## Proof and skip reporting

- Capture action and resulting UI (screenshots under `artifacts/verify-b2b-portal/<VERIFY_RUN_ID>/`).
- If seed data is missing, fail and document the gap under the feature's **Gotchas** — do not weaken the journey.

## Features

- [Vendor catalog search and PDP](./catalog-search-pdp.md) — login, typeahead, product page.
- [Payload admin staff UI](./payload-admin.md) — staff login, dashboard, Users collection.
