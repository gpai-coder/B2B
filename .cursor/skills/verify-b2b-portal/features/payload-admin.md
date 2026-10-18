# Payload admin staff UI

Staff users manage catalog, vendors, and orders through the embedded Payload admin at `/admin`.

## Sub-features

- `admin-login` — staff email/password on `/admin/login`.
- `admin-dashboard` — lands on admin shell after login.
- `admin-users-list` — navigates to Users collection list view.

## How to get to it (user POV)

- Visit `/admin/login`.
- Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env.example`.
- Open **Users** from the collections nav (or go to `/admin/collections/users`).

## Driving it with Playwright

Preconditions:

- `node scripts/verify-b2b-portal/doctor.mjs` passes.
- Seed admin user exists (`pnpm db:seed`).

- **Login.** Fill `input[name="email"]` and password; click **Login**; wait for `/admin` without `login`. Screenshot `04-admin-dashboard.png`.
- **Users list.** Go to `/admin/collections/users`; expect heading **Users**. Screenshot `05-admin-users-list.png`.
- **Proof.** Run `node scripts/verify-b2b-portal/drive-admin.mjs` with the same `VERIFY_RUN_ID`.

## Gotchas

- Admin login button label is **Login** (case-insensitive), not the storefront **Sign in**.
- CSP / Gravatar noise is tracked in `tests/e2e/admin-csp.spec.ts`; verification drive only checks navigation, not CSP console.
- Never run admin drives against production URLs without explicit operator approval and isolated DB.
