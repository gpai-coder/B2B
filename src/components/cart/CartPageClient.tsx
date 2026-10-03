'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { removeFromCartAction } from '@/app/(frontend)/cart/actions'
import type { CartSummary } from '@/commerce/types'
import { AddToCartControls } from '@/components/cart/AddToCartControls'

type Props = {
  summary: CartSummary
}

export function CartPageClient({ summary }: Props) {
  const router = useRouter()

  if (summary.lines.length === 0) {
    return (
      <div className="as-cart as-cart--empty" data-testid="cart-empty">
        <h1>Your cart</h1>
        <p>Your cart is empty.</p>
        <Link href="/catalog" className="as-btn-secondary">
          Browse catalog
        </Link>
      </div>
    )
  }

  return (
    <div className="as-cart" data-testid="cart-page">
      <h1 className="as-plp__title">Your cart</h1>
      <table className="as-cart-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {summary.lines.map((line) => (
            <tr
              key={line.sku}
              data-testid={`cart-line-${line.sku}`}
              className={line.available ? undefined : 'as-cart-line--unavailable'}
            >
              <td>
                {line.productName}
                {!line.available && line.unavailableReason ? (
                  <p className="as-field-error" data-testid={`cart-unavailable-${line.sku}`}>
                    {line.unavailableReason}
                  </p>
                ) : null}
              </td>
              <td>{line.sku}</td>
              <td>
                {line.available && line.moq != null && line.orderMultiple != null ? (
                  <AddToCartControls
                    sku={line.sku}
                    moq={line.moq}
                    orderMultiple={line.orderMultiple}
                    mode="set"
                    initialQuantity={line.quantity}
                  />
                ) : (
                  <span data-testid={`cart-qty-readonly-${line.sku}`}>{line.quantity}</span>
                )}
              </td>
              <td>
                {line.available && line.unitPrice ? (
                  <>
                    ${line.unitPrice.amount.toFixed(2)} ({line.source})
                    {line.quantityBreaks && line.quantityBreaks.length > 0 ? (
                      <ul className="as-cart-tier-hints">
                        {line.quantityBreaks.map((b) => (
                          <li key={b.minQuantity}>
                            {b.minQuantity}+ @ ${b.unitPrice.toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td data-testid={`cart-line-total-${line.sku}`}>
                {line.available && line.lineTotal != null ? `$${line.lineTotal.toFixed(2)}` : '—'}
              </td>
              <td>
                <button
                  type="button"
                  className="as-btn-text"
                  data-testid={`cart-remove-${line.sku}`}
                  onClick={() => {
                    void removeFromCartAction(line.sku).then(() => router.refresh())
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="as-cart-subtotal" data-testid="cart-subtotal">
        Subtotal: ${summary.subtotal.toFixed(2)} {summary.currency}
      </p>
      <p className="as-cart-note">Checkout arrives in the next ordering release.</p>
    </div>
  )
}
