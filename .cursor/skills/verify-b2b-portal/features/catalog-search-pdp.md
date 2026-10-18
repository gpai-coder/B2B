# Vendor catalog search and PDP

Approved vendors search the catalog, pick a typeahead result, and land on a product detail page with contract pricing context.

## Sub-features

- `catalog-login` — vendor signs in and reaches `/catalog`.
- `catalog-typeahead` — SKU fragment opens suggest dropdown.
- `catalog-pdp` — choosing a suggest link opens PDP with `product-page` test id.

## How to get to it (user POV)

- Open `/login?next=/catalog`, sign in as seed vendor Pacific Plumbing (`SEED_VENDOR_A_*` in `.env.example`).
- Use the catalog search field on `/catalog`.
- Click a product link in the suggestion list.

## Driving it with Playwright

Preconditions:

- `node scripts/verify-b2b-portal/doctor.mjs` passes.
- Seed catalog includes SKU `7353101` (Townsend faucet family).

- **Sign in.** Fill email/password, click **Sign in**, wait until URL is not `/login`. Screenshot `01-catalog-after-login.png`.
- **Typeahead.** Fill `catalog-search-input` with `7353101`; wait for `catalog-search-suggest`. Screenshot `02-catalog-typeahead.png`.
- **Open PDP.** Click first link in suggest; wait for URL `/products/...` and `product-page` visible. Screenshot `03-product-pdp.png`.
- **Proof.** Run `node scripts/verify-b2b-portal/drive-catalog.mjs` with the same `VERIFY_RUN_ID`.

## Gotchas

- Empty catalog usually means `pnpm db:seed` did not run or migrate failed.
- Typeahead can take up to ~15s on cold start; do not shorten the wait without measuring.
- Do not use Payload admin credentials on the storefront login form.
