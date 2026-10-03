import { describe, it, expect, beforeAll } from 'vitest'
import { getPayload } from 'payload'

import config from '@/payload.config'

import { createPostgresCommerceService } from './postgres'

describe('postgres commerce service', () => {
  it('returns company-specific price for seeded Pacific contract', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const commerce = createPostgresCommerceService(payload, null)

    const pacific = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Pacific Plumbing Supply' } },
      limit: 1,
      overrideAccess: true,
    })
    const companyId = String(pacific.docs[0]!.id)

    const prices = await commerce.getPrices(companyId, ['7353101.002'])
    expect(prices).toHaveLength(1)
    expect(prices[0]!.unitPrice.amount).toBe(199)
    expect(prices[0]!.source).toBe('company')
    expect(prices[0]!.quantityBreaks).toEqual([
      { minQuantity: 10, unitPrice: 189 },
      { minQuantity: 25, unitPrice: 179 },
    ])
  })

  it('creates and submits a draft order from the seeded quote', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const commerce = createPostgresCommerceService(payload, null)

    const pacific = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Pacific Plumbing Supply' } },
      limit: 1,
      overrideAccess: true,
    })
    const companyId = String(pacific.docs[0]!.id)

    const quotes = await commerce.listQuotes(companyId)
    const quote = quotes.find((q) => q.quoteNumber === 'Q-2026-0001')
    expect(quote).toBeDefined()

    const draft = await commerce.createDraftOrder({
      companyId,
      quoteId: quote!.id,
      shipTo: {
        name: 'Pacific Plumbing Supply',
        line1: '100 Market Street',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      },
    })
    expect(draft.status).toBe('draft')

    const submitted = await commerce.submitOrder(draft.id, `test-${Date.now()}`, companyId)
    expect(submitted.status).toBe('submitted')
    expect(submitted.orderNumber).toBeTruthy()
  })

  it('returns standard list price for companies without a contract', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const commerce = createPostgresCommerceService(payload, null)

    const bay = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Bay Area Fixtures' } },
      limit: 1,
      overrideAccess: true,
    })
    const prices = await commerce.getPrices(String(bay.docs[0]!.id), ['7353101.002'])
    expect(prices[0]?.unitPrice.amount).toBe(234)
    expect(prices[0]?.source).toBe('standard')
  })

  it('submitOrder is idempotent for the same key', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const commerce = createPostgresCommerceService(payload, null)
    const pacific = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Pacific Plumbing Supply' } },
      limit: 1,
      overrideAccess: true,
    })
    const companyId = String(pacific.docs[0]!.id)
    const key = `idempotency-test-${Date.now()}`

    const draft = await commerce.createDraftOrder({
      companyId,
      shipTo: {
        name: 'Pacific',
        line1: '1 Main',
        city: 'SF',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      },
      lines: [{ sku: '7353101.002', quantity: 2 }],
    })

    const first = await commerce.submitOrder(draft.id, key, companyId)
    const second = await commerce.submitOrder(draft.id, key, companyId)

    expect(first.id).toBe(second.id)
    expect(first.orderNumber).toBe(second.orderNumber)

    const all = await payload.find({
      collection: 'orders',
      where: { idempotencyKey: { equals: key } },
      overrideAccess: true,
    })
    expect(all.totalDocs).toBe(1)
  })
})
