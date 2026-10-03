// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { CartValidationError, createPostgresCommerceService } from '@/commerce/postgres'
import { SEED_HERO_SKU } from '@/scripts/seed'

describe('checkout commerce', () => {
  let payload: Payload
  let pacificCompanyId: string
  let pacificUserId: number
  let bayCompanyId: string
  let bayUserId: number

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
    pacificCompanyId = String(pacific.docs[0]!.id)
    bayCompanyId = String(bay.docs[0]!.id)
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
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  const pacificShipTo = {
    name: 'Pacific Plumbing Supply',
    line1: '100 Market Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
  }

  async function pacificCommerce() {
    const user = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    return createPostgresCommerceService(payload, user)
  }

  async function clearCart() {
    const svc = await pacificCommerce()
    for (const line of await svc.getCart(pacificCompanyId)) {
      await svc.removeCartLine(pacificCompanyId, line.sku)
    }
  }

  beforeEach(async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCart()
  })

  it('rejects duplicate PO numbers for the same company', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const svc = await pacificCommerce()
    const po = `PO-FIXED-${Date.now()}`
    await svc.setCartLine(pacificCompanyId, SEED_HERO_SKU, 1)
    await svc.submitCartCheckout(pacificCompanyId, {
      poNumber: po,
      shipTo: pacificShipTo,
      idempotencyKey: `k1-${Date.now()}`,
    })
    await svc.setCartLine(pacificCompanyId, SEED_HERO_SKU, 1)
    await expect(
      svc.submitCartCheckout(pacificCompanyId, {
        poNumber: po,
        shipTo: pacificShipTo,
        idempotencyKey: `k2-${Date.now()}`,
      }),
    ).rejects.toBeInstanceOf(CartValidationError)
  })

  it('convertQuoteToOrder links quote exactly once', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const svc = await pacificCommerce()
    const quotes = await svc.listQuotes(pacificCompanyId)
    const quote = quotes.find((q) => q.quoteNumber === 'Q-2026-0001')
    expect(quote).toBeDefined()
    await payload.update({
      collection: 'quotes',
      id: Number(quote!.id),
      data: { convertedOrder: null },
      overrideAccess: true,
    })
    const key = `quote-convert-${Date.now()}`
    const first = await svc.convertQuoteToOrder(pacificCompanyId, quote!.id, {
      poNumber: `PO-Q-${Date.now()}`,
      shipTo: pacificShipTo,
      idempotencyKey: key,
    })
    const second = await svc.convertQuoteToOrder(pacificCompanyId, quote!.id, {
      poNumber: `PO-Q-other-${Date.now()}`,
      shipTo: pacificShipTo,
      idempotencyKey: `${key}-other`,
    })
    expect(second.id).toBe(first.id)
    const quoteDoc = await payload.findByID({
      collection: 'quotes',
      id: Number(quote!.id),
      overrideAccess: true,
    })
    const convertedId =
      quoteDoc.convertedOrder == null
        ? null
        : typeof quoteDoc.convertedOrder === 'object'
          ? (quoteDoc.convertedOrder as { id: number }).id
          : quoteDoc.convertedOrder
    expect(String(convertedId)).toBe(first.id)
  })

  it('vendor cannot read another company order', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const pacificSvc = await pacificCommerce()
    await pacificSvc.setCartLine(pacificCompanyId, SEED_HERO_SKU, 1)
    const order = await pacificSvc.submitCartCheckout(pacificCompanyId, {
      poNumber: `PO-ISO-${Date.now()}`,
      shipTo: pacificShipTo,
      idempotencyKey: `iso-${Date.now()}`,
    })
    const bayUser = await payload.findByID({ collection: 'users', id: bayUserId, overrideAccess: true })
    const baySvc = createPostgresCommerceService(payload, bayUser)
    await expect(baySvc.getOrder(order.id, bayCompanyId)).resolves.toBeNull()
  })
})
