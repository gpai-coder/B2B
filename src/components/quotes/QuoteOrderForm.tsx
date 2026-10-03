'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { submitQuoteOrderAction } from '@/app/(frontend)/quotes/[quoteNumber]/order/actions'
import type { ShipToFields } from '@/lib/checkout/ship-to'

type Props = {
  quoteNumber: string
  defaultPo: string
  ship: ShipToFields
}

export function QuoteOrderForm({ quoteNumber, defaultPo, ship }: Props) {
  const router = useRouter()
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(formData: FormData) {
    setSubmitting(true)
    setError(null)
    formData.set('idempotencyKey', idempotencyKey)
    const result = await submitQuoteOrderAction(quoteNumber, formData)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/orders/${result.orderId}?submitted=1`)
    router.refresh()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit(new FormData(event.currentTarget))
      }}
    >
      <label>
        PO number *
        <input name="poNumber" required defaultValue={defaultPo} data-testid="quote-order-po" />
      </label>
      <fieldset>
        <legend>Ship to</legend>
        <label>
          Name *
          <input name="shipToName" required defaultValue={ship.name ?? ''} />
        </label>
        <label>
          Address *
          <input name="shipToLine1" required defaultValue={ship.line1 ?? ''} />
        </label>
        <label>
          City *
          <input name="shipToCity" required defaultValue={ship.city ?? ''} />
        </label>
        <label>
          State *
          <input name="shipToState" required defaultValue={ship.state ?? ''} />
        </label>
        <label>
          Postal code *
          <input name="shipToPostalCode" required defaultValue={ship.postalCode ?? ''} />
        </label>
      </fieldset>
      <label>
        Order notes
        <textarea name="orderNotes" rows={2} data-testid="quote-order-notes" />
      </label>
      {error ? (
        <p className="error" data-testid="quote-order-error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={submitting} data-testid="submit-quote-order">
        {submitting ? 'Submitting…' : 'Submit order'}
      </button>
    </form>
  )
}
