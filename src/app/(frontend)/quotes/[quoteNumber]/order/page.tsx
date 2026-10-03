import { redirect } from 'next/navigation'

import { QuoteOrderForm } from '@/components/quotes/QuoteOrderForm'
import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { quoteOrderAvailability } from '@/lib/quotes/quote-order-eligibility'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'

type Props = { params: Promise<{ quoteNumber: string }> }

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export default async function QuoteOrderPage({ params }: Props) {
  const { quoteNumber } = await params
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect(`/login?next=/quotes/${encodeURIComponent(quoteNumber)}/order`)
  }
  if (!user.approved) {
    return <p className="error">{PENDING_APPROVAL}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const payload = await getPayload({ config: await config })
  const req = createPayloadReq(payload, user)
  const quotes = await payload.find({
    collection: 'quotes',
    where: { quoteNumber: { equals: quoteNumber } },
    limit: 1,
    overrideAccess: false,
    req,
  })
  const quoteDoc = quotes.docs[0]
  const availability = quoteOrderAvailability(quoteDoc, companyId)
  if (!availability.ok) {
    return (
      <div className="quote-order" data-testid="quote-order-page">
        <h1>Order from {quoteNumber}</h1>
        <p className="error" data-testid="quote-order-unavailable">
          {availability.message}
        </p>
      </div>
    )
  }

  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req,
  })
  const ship =
    shipToFromCompanyDefault(company.defaultShipTo) ?? {
      name: '',
      line1: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US',
    }

  return (
    <div className="quote-order" data-testid="quote-order-page">
      <h1>Order from {quoteNumber}</h1>
      <p>Submit a purchase order from this accepted quote (one order per quote).</p>
      <QuoteOrderForm quoteNumber={quoteNumber} defaultPo={`PO-${quoteNumber}`} ship={ship} />
    </div>
  )
}
