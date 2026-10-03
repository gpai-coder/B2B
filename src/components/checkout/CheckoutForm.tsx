'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { submitCartCheckoutAction } from '@/app/(frontend)/checkout/actions'
import type { CartSummary } from '@/commerce/types'
import type { ShipToFields } from '@/lib/checkout/ship-to'
import type { ShipToAddressRecord } from '@/lib/vendor/ship-to-addresses'

type Props = {
  summary: CartSummary
  defaultShipTo: ShipToFields | null
  savedAddresses: ShipToAddressRecord[]
}

function emptyShip(): ShipToFields {
  return { name: '', line1: '', city: '', state: '', postalCode: '', country: 'US' }
}

export function CheckoutForm({ summary, defaultShipTo, savedAddresses }: Props) {
  const router = useRouter()
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])
  const defaultAddressId =
    savedAddresses.find((a) => a.isDefault)?.id ?? savedAddresses[0]?.id ?? ''
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddressId)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selected = savedAddresses.find((a) => a.id === selectedAddressId)
  const ship = selected?.shipTo ?? defaultShipTo ?? emptyShip()

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
      <p data-testid="checkout-line-count">
        {summary.lines.length} line(s) · ${summary.subtotal.toFixed(2)}
      </p>

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

        {savedAddresses.length > 0 ? (
          <label>
            Saved ship-to address
            <select
              value={selectedAddressId}
              onChange={(event) => setSelectedAddressId(event.target.value)}
              data-testid="checkout-shipto-select"
            >
              {savedAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label}
                  {address.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <fieldset className="as-checkout-shipto">
          <legend>Ship to</legend>
          <label>
            Name *
            <input
              key={`name-${selectedAddressId}`}
              name="shipToName"
              required
              defaultValue={ship.name}
              data-testid="checkout-shipto-name"
            />
          </label>
          <label>
            Address line 1 *
            <input
              key={`line1-${selectedAddressId}`}
              name="shipToLine1"
              required
              defaultValue={ship.line1}
              data-testid="checkout-shipto-line1"
            />
          </label>
          <label>
            Address line 2
            <input
              key={`line2-${selectedAddressId}`}
              name="shipToLine2"
              defaultValue={ship.line2 ?? ''}
              data-testid="checkout-shipto-line2"
            />
          </label>
          <label>
            City *
            <input
              key={`city-${selectedAddressId}`}
              name="shipToCity"
              required
              defaultValue={ship.city}
              data-testid="checkout-shipto-city"
            />
          </label>
          <label>
            State *
            <input
              key={`state-${selectedAddressId}`}
              name="shipToState"
              required
              defaultValue={ship.state}
              data-testid="checkout-shipto-state"
            />
          </label>
          <label>
            Postal code *
            <input
              key={`postal-${selectedAddressId}`}
              name="shipToPostalCode"
              required
              defaultValue={ship.postalCode}
              data-testid="checkout-shipto-postal"
            />
          </label>
          <label>
            Country
            <input
              key={`country-${selectedAddressId}`}
              name="shipToCountry"
              defaultValue={ship.country ?? 'US'}
              data-testid="checkout-shipto-country"
            />
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
