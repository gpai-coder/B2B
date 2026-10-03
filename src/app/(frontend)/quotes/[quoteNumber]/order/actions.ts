'use server'

import { randomUUID } from 'crypto'

import { getPayload } from 'payload'
import { redirect } from 'next/navigation'

import { getCommerce } from '@/commerce'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export async function createAndSubmitQuoteOrder(quoteNumber: string) {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    throw new Error('Unauthorized')
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) throw new Error('Missing company')

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const quotes = await payload.find({
    collection: 'quotes',
    where: { quoteNumber: { equals: quoteNumber } },
    limit: 1,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
  const quoteDoc = quotes.docs[0]
  if (!quoteDoc) throw new Error('Quote not found')

  const commerce = await getCommerce({ user })
  const quote = await commerce.getQuote(String(quoteDoc.id), companyId)
  if (!quote) throw new Error('Quote not available')

  const draft = await commerce.createDraftOrder({
    companyId,
    quoteId: quote.id,
    poNumber: `PO-${quote.quoteNumber}`,
    shipTo: {
      name: 'Pacific Plumbing Supply',
      line1: '100 Market Street',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    },
  })

  const submitted = await commerce.submitOrder(draft.id, randomUUID(), companyId)
  redirect(`/orders/${submitted.id}?submitted=1`)
}
