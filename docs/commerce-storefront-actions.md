# Storefront commerce actions

Vendor-facing **mutations** (cart, checkout, quote conversion, quick order) must go through `getCommerce()` in server actions under `src/app/(frontend)/**/actions.ts`.

## Audited actions (2026-10)

| File | Commerce APIs |
| --- | --- |
| `cart/actions.ts` | `addCartQuantity`, `setCartLine`, `removeCartLine` |
| `checkout/actions.ts` | `submitCartCheckout` |
| `quick-order/actions.ts` | `previewQuickOrder`, `applyQuickOrder` |
| `quotes/.../order/actions.ts` | `convertQuoteToOrder` |

Account ship-to CRUD uses `@/lib/vendor/ship-to-addresses` with Payload passed from `vendorPayloadContext()` — not commerce, but still no direct `payload.update` in the action file.

## Enforcement

- ESLint `no-restricted-imports` blocks the `payload` package in `app/(frontend)/**`
- `scripts/storefront-import-boundary.test.ts` in unit test suite
