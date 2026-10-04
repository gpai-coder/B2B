import type { Payload, PayloadRequest } from 'payload'

import { runBoundedUniqueRetry } from '@/lib/db/bounded-unique-retry'
import {
  allocateQuoteNumber,
  isQuoteNumberCollision,
} from '@/lib/quotes/allocate-quote-number'
import { prepareQuoteDraftData } from '@/lib/quotes/quote-prepare'

export const QUOTE_CREATE_NESTED = 'quoteCreateNested'
export const QUOTE_CREATE_PENDING_DATA = 'quoteCreatePendingData'
export const QUOTE_CREATE_OVERRIDE_ACCESS = 'quoteCreateOverrideAccess'

/** Pick a unique quote number and insert the document (bounded retry on unique violation). */
export async function createQuoteWithUniqueNumber(
  payload: Payload,
  req: PayloadRequest,
  data: Record<string, unknown>,
  options: { overrideAccess: boolean },
): Promise<import('@/payload-types').Quote> {
  return runBoundedUniqueRetry(
    payload,
    req,
    async () => {
      const quoteNumber = await allocateQuoteNumber(payload, req)
      const prepared = await prepareQuoteDraftData(payload, req, {
        ...data,
        quoteNumber,
      })
      return payload.create({
        collection: 'quotes',
        data: prepared as never,
        req,
        overrideAccess: options.overrideAccess,
        context: {
          ...(req.context as Record<string, unknown>),
          [QUOTE_CREATE_NESTED]: true,
        },
      })
    },
    { isCollision: isQuoteNumberCollision },
  )
}
