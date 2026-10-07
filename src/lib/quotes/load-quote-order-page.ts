import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { quoteOrderAvailability } from '@/lib/quotes/quote-order-eligibility'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { User } from '@/payload-types'

export type QuoteOrderPageData =
  | { ok: false; message: string }
  | {
      ok: true
      quoteNumber: string
      defaultPo: string
      ship: {
        name: string
        line1: string
        line2?: string
        city: string
        state: string
        postalCode: string
        country: string
      }
    }

export async function loadQuoteOrderPage(
  user: User,
  companyId: string,
  quoteNumber: string,
): Promise<QuoteOrderPageData> {
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
  const ship =
    shipToFromCompanyDefault(company.defaultShipTo) ?? {
      name: '',
      line1: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US',
    }

  return {
    ok: true,
    quoteNumber,
    defaultPo: `PO-${quoteNumber}`,
    ship,
  }
}
