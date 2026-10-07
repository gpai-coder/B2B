# Cart and quote concurrency

## Policy

- **Cart mutations** must run through `runCartMutation` in `src/commerce/cart-serialized.ts` (Postgres row locks on `carts`).
- **Quote convert / withdraw races** must not treat a lost race as success. Do not swallow concurrent updates as no-ops (see revert `d5e07c9`).
- **Staff quote/order updates** use Payload transactions in `src/lib/orders/payload-transaction.ts` and quote workflow hooks.

## Regression tests (run in CI)

| Area | Test file |
| --- | --- |
| Cart row locks | `tests/int/cart-concurrency.int.spec.ts` |
| Cart commerce API | `tests/int/cart-commerce.int.spec.ts` |
| Quote builder races | `tests/int/staff-quote-builder.int.spec.ts` |
| Quote order | `tests/int/quote-order.int.spec.ts` |
| Checkout concurrency | `tests/int/checkout-concurrency.int.spec.ts` |

When changing locking or quote status transitions, update or extend these tests before merging.
