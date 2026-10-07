import { getCommerce } from '@/commerce'
import { QUOTE_NOT_AVAILABLE_MESSAGE, quoteOrderAvailability } from '@/lib/quotes/quote-order-eligibility'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { User } from '@/payload-types'

function formatExpiry(expiresAt?: string | null) {
  if (!expiresAt) return '—'
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

export type QuoteListRow = {
  id: string
  quoteNumber: string
  status: string
  expiresAt: string
  orderHref: string | null
  unavailable: string | null
}

export async function loadQuotesListPage(user: User, companyId: string): Promise<QuoteListRow[]> {
  const commerce = await getCommerce({ user })
  const quotes = await commerce.listQuotes(companyId)
  const payload = await getAppPayload()
  const req = createPayloadReq(payload, user)

  return Promise.all(
    quotes.map(async (q) => {
      const full = await payload.findByID({
        collection: 'quotes',
        id: Number(q.id),
        overrideAccess: false,
        req,
      })
      const canOrder = quoteOrderAvailability(full, companyId).ok
      return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: full.status ?? '—',
        expiresAt: formatExpiry(full.expiresAt),
        orderHref: canOrder ? `/quotes/${encodeURIComponent(q.quoteNumber)}/order` : null,
        unavailable: canOrder ? null : QUOTE_NOT_AVAILABLE_MESSAGE,
      }
    }),
  )
}
