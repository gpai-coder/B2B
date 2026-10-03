'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { submitCartCheckoutAction } from '@/app/(frontend)/checkout/actions'
import type { CartSummary } from '@/commerce/types'
import type { ShipToFields } from '@/lib/checkout/ship-to'

type Props = {
  summary: CartSummary
  defaultShipTo: ShipToFields | null
}

export function CheckoutForm({ summary, defaultShipTo }: Props) {
  const router = useRouter()
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ship = defaultShipTo ?? {
    name: '',
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  }

  async function onSubmit(formData: FormData) {
    setSubmitting(true)
    setError(null)
    const result = await submitCartCheckoutAction(formData, idempotencyKey)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/orders/${result.orderId}?submitted=1`)
    router.refresh()
  }

  return (
    <div className="as-checkout" data-testid="checkout-page">
      <h1 className="as-plp__title">Checkout</h1>
      <p data-testid="checkout-line-count">{summary.lines.length} line(s) · ${summary.subtotal.toFixed(2)}</p>

      <form
        className="as-checkout-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit(new FormData(event.currentTarget))
        }}
      >
        <label>
          PO number *
          <input name="poNumber" required maxLength={35} data-testid="checkout-po" />
        </label>

        <fieldset className="as-checkout-shipto">
          <legend>Ship to</legend>
          <label>
            Name *
            <input name="shipToName" required defaultValue={ship.name} data-testid="checkout-shipto-name" />
          </label>
          <label>
            Address line 1 *
            <input name="shipToLine1" required defaultValue={ship.line1} data-testid="checkout-shipto-line1" />
          </label>
          <label>
            Address line 2
            <input name="shipToLine2" defaultValue={ship.line2 ?? ''} data-testid="checkout-shipto-line2" />
          </label>
          <label>
            City *
            <input name="shipToCity" required defaultValue={ship.city} data-testid="checkout-shipto-city" />
          </label>
          <label>
            State *
            <input name="shipToState" required defaultValue={ship.state} data-testid="checkout-shipto-state" />
          </label>
          <label>
            Postal code *
            <input
              name="shipToPostalCode"
              required
              defaultValue={ship.postalCode}
              data-testid="checkout-shipto-postal"
            />
          </label>
          <label>
            Country
            <input name="shipToCountry" defaultValue={ship.country ?? 'US'} data-testid="checkout-shipto-country" />
          </label>
        </fieldset>

        <label>
          Order notes
          <textarea name="orderNotes" rows={3} data-testid="checkout-notes" />
        </label>

        {error ? (
          <p className="as-field-error" data-testid="checkout-error">
            {error}
          </p>
        ) : null}

        <div className="as-checkout-actions">
          <Link href="/cart" className="as-btn-secondary">
            Back to cart
          </Link>
          <button type="submit" disabled={submitting} data-testid="checkout-submit">
            {submitting ? 'Submitting…' : 'Place order'}
          </button>
        </div>
      </form>
    </div>
  )
}
