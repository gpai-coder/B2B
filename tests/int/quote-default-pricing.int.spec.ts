// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'
import { SEED_HERO_SKU } from '@/scripts/seed'

describe('quote default line pricing (REST/admin path)', () => {
  let payload: Payload
  let pacificCompanyId: number
  let bayCompanyId: number
  let staffUserId: number
  let heroVariantId: number

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
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
    const staff = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test' } },
      limit: 1,
      overrideAccess: true,
    })
    staffUserId = staff.docs[0]!.id
    const variant = await payload.find({
      collection: 'product-variants',
      where: { sku: { equals: SEED_HERO_SKU } },
      limit: 1,
      overrideAccess: true,
    })
    heroVariantId = variant.docs[0]!.id
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  async function staffReq() {
    const staff = await payload.findByID({ collection: 'users', id: staffUserId, overrideAccess: true })
    return createPayloadReq(payload, staff)
  }

  async function createDraftQuote(companyId: number, quantity: number) {
    const req = await staffReq()
    return payload.create({
      collection: 'quotes',
      data: {
        company: companyId,
        status: 'draft',
        lines: [{ sku: SEED_HERO_SKU, variant: heroVariantId, quantity }],
      },
      req,
      overrideAccess: false,
    } as Parameters<Payload['create']>[0])
  }

  it('fills Pacific contract tier prices for blank unitPrice', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const q1 = (await createDraftQuote(pacificCompanyId, 1)) as import('@/payload-types').Quote
    expect(q1.lines?.[0]?.unitPrice).toBe(199)
    await payload.delete({ collection: 'quotes', id: q1.id, overrideAccess: true })

    const q10 = (await createDraftQuote(pacificCompanyId, 10)) as import('@/payload-types').Quote
    expect(q10.lines?.[0]?.unitPrice).toBe(189)
    await payload.delete({ collection: 'quotes', id: q10.id, overrideAccess: true })

    const q25 = (await createDraftQuote(pacificCompanyId, 25)) as import('@/payload-types').Quote
    expect(q25.lines?.[0]?.unitPrice).toBe(179)
    await payload.delete({ collection: 'quotes', id: q25.id, overrideAccess: true })
  })

  it('fills Bay standard list price for blank unitPrice', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const quote = (await createDraftQuote(bayCompanyId, 1)) as import('@/payload-types').Quote
    expect(quote.lines?.[0]?.unitPrice).toBe(234)
    await payload.delete({ collection: 'quotes', id: quote.id, overrideAccess: true })
  })
})
