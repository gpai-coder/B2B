import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { quoteOrderAvailability } from '@/lib/quotes/quote-order-eligibility'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { Quote } from '@/payload-types'
import type { User } from '@/payload-types'

export type QuoteOrderSubmitContext =
  | { ok: false; message: string }
  | {
      ok: true
      quoteDoc: Quote
      defaultShip: ReturnType<typeof shipToFromCompanyDefault>
    }

export async function loadQuoteOrderSubmitContext(
  user: User,
  companyId: string,
  quoteNumber: string,
): Promise<QuoteOrderSubmitContext> {
  const payload = await getAppPayload()
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
    return { ok: false, message: availability.message }
  }

  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req,
  })
  const defaultShip = shipToFromCompanyDefault(company.defaultShipTo)
  return { ok: true, quoteDoc, defaultShip }
}
