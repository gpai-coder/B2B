import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'

import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'

import { createAndSubmitQuoteOrder } from './actions'

type Props = { params: Promise<{ quoteNumber: string }> }

export default async function QuoteOrderPage({ params }: Props) {
  const { quoteNumber } = await params
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect(`/login?next=/quotes/${encodeURIComponent(quoteNumber)}/order`)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const payload = await getPayload({ config: await config })
  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
  const ship = shipToFromCompanyDefault(company.defaultShipTo)

  async function submit(formData: FormData) {
    'use server'
    await createAndSubmitQuoteOrder(quoteNumber, formData)
  }

  return (
    <div className="quote-order" data-testid="quote-order-page">
      <h1>Order from {quoteNumber}</h1>
      <p>Submit a purchase order from this accepted quote (one order per quote).</p>
      <form action={submit}>
        <input type="hidden" name="idempotencyKey" value={randomUUID()} readOnly />
        <label>
          PO number *
          <input name="poNumber" required defaultValue={`PO-${quoteNumber}`} data-testid="quote-order-po" />
        </label>
        <fieldset>
          <legend>Ship to</legend>
          <label>
            Name *
            <input name="shipToName" required defaultValue={ship?.name ?? ''} />
          </label>
          <label>
            Address *
            <input name="shipToLine1" required defaultValue={ship?.line1 ?? ''} />
          </label>
          <label>
            City *
            <input name="shipToCity" required defaultValue={ship?.city ?? ''} />
          </label>
          <label>
            State *
            <input name="shipToState" required defaultValue={ship?.state ?? ''} />
          </label>
          <label>
            Postal code *
            <input name="shipToPostalCode" required defaultValue={ship?.postalCode ?? ''} />
          </label>
        </fieldset>
        <label>
          Order notes
          <textarea name="orderNotes" rows={2} data-testid="quote-order-notes" />
        </label>
        <button type="submit" data-testid="submit-quote-order">
          Submit order
        </button>
      </form>
    </div>
  )
}
