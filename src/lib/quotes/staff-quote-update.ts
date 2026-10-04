import type { Payload, PayloadRequest } from 'payload'

import { setQuoteClientLines, setQuoteClientStatus } from '@/lib/quotes/quote-workflow'
import { withPayloadTransaction } from '@/lib/orders/payload-transaction'

export async function staffQuoteUpdate(
  payload: Payload,
  req: PayloadRequest,
  quoteId: number,
  data: Record<string, unknown>,
) {
  const snapshot = await payload.findByID({
    collection: 'quotes',
    id: quoteId,
    depth: 0,
    overrideAccess: true,
  })
  setQuoteClientStatus(req, String(snapshot.status ?? 'draft'))
  setQuoteClientLines(req, snapshot.lines)
  return withPayloadTransaction(payload, req, () =>
    payload.update({
      collection: 'quotes',
      id: quoteId,
      data,
      req,
      overrideAccess: true,
    }),
  )
}
