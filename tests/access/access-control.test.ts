import { describe, it, expect, beforeAll } from 'vitest'
import { getPayload } from 'payload'

import config from '@/payload.config'

import { createPostgresCommerceService } from '@/commerce/postgres'
import { createPayloadReq } from '@/lib/payload-req'

describe('access control', () => {
  let pacificUserId: number
  let bayUserId: number
  let pacificCompanyId: number
  let bayCompanyId: number
  let pacificQuoteId: number
  let pacificOrderId: number

  beforeAll(async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    const pacific = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Pacific Plumbing Supply' } },
      limit: 1,
      overrideAccess: true,
    })
    const bay = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Bay Area Fixtures' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificCompanyId = pacific.docs[0]!.id
    bayCompanyId = bay.docs[0]!.id

    const pacificUser = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local' } },
      limit: 1,
      overrideAccess: true,
    })
    const bayUser = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_B_EMAIL ?? 'buyer@bay-fixtures.local' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificUserId = pacificUser.docs[0]!.id
    bayUserId = bayUser.docs[0]!.id

    const quote = await payload.find({
      collection: 'quotes',
      where: { quoteNumber: { equals: 'Q-2026-0001' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificQuoteId = quote.docs[0]!.id

    const order = await payload.create({
      collection: 'orders',
      data: {
        company: pacificCompanyId,
        status: 'draft',
        shipTo: {
          name: 'Pacific',
          line1: '1 Main',
          city: 'SF',
          state: 'CA',
          postalCode: '94105',
          country: 'US',
        },
        lines: [{ sku: 'LIX-FCT-1001', quantity: 1, unitPrice: 159 }],
      },
      overrideAccess: true,
    })
    pacificOrderId = order.id
  })

  it('blocks unapproved vendor login', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    await expect(
      payload.login({
        collection: 'users',
        data: {
          email: process.env.SEED_VENDOR_B_EMAIL ?? 'buyer@bay-fixtures.local',
          password: process.env.SEED_VENDOR_B_PASSWORD ?? 'local-dev-vendor-b-password',
        },
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/approval|approved/i),
    })
  })

  it('vendor cannot read another company quotes', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const bayUser = await payload.findByID({ collection: 'users', id: bayUserId, overrideAccess: true })

    const result = await payload.find({
      collection: 'quotes',
      where: { id: { equals: pacificQuoteId } },
      overrideAccess: false,
      req: createPayloadReq(payload, bayUser),
    })
    expect(result.docs).toHaveLength(0)
  })

  it('vendor cannot read another company orders', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const bayUser = await payload.findByID({ collection: 'users', id: bayUserId, overrideAccess: true })

    const result = await payload.find({
      collection: 'orders',
      where: { id: { equals: pacificOrderId } },
      overrideAccess: false,
      req: createPayloadReq(payload, bayUser),
    })
    expect(result.docs).toHaveLength(0)
  })

  it('vendor cannot read another company price lists via commerce getPrices context', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const commerce = createPostgresCommerceService(payload)

    const pacificPrices = await commerce.getPrices(String(pacificCompanyId), ['LIX-FCT-1001'])
    const bayPrices = await commerce.getPrices(String(bayCompanyId), ['LIX-FCT-1001'])

    expect(pacificPrices[0]?.unitPrice.amount).toBe(159)
    expect(bayPrices[0]?.unitPrice.amount).toBe(189)
    expect(bayPrices[0]?.source).toBe('standard')
  })

  it('vendor price list query excludes other company lists', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const bayUser = await payload.findByID({ collection: 'users', id: bayUserId, overrideAccess: true })

    const lists = await payload.find({
      collection: 'price-lists',
      where: { kind: { equals: 'company' } },
      overrideAccess: false,
      req: createPayloadReq(payload, bayUser),
    })
    const names = lists.docs.map((d) => d.name)
    expect(names).not.toContain('Pacific Plumbing Contract 2026')
  })

  it('submitOrder is idempotent for the same key', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const commerce = createPostgresCommerceService(payload)
    const companyId = String(pacificCompanyId)
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
      lines: [{ sku: 'LIX-FCT-1001', quantity: 2 }],
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
