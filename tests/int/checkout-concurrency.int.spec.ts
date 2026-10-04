// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { CartValidationError, createPostgresCommerceService } from '@/commerce/postgres'
import { SEED_HERO_SKU, SEED_QUOTE_NUMBER } from '@/scripts/seed'

const POOL_MAX = Number(process.env.DB_POOL_MAX ?? 5)

describe('checkout concurrency', () => {
  let payload: Payload
  let pacificCompanyId: string
  let pacificUserId: number

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
    const pacific = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Pacific Plumbing Supply' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificCompanyId = String(pacific.docs[0]!.id)
    const user = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificUserId = user.docs[0]!.id
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  const shipTo = {
    name: 'Pacific Plumbing Receiving',
    line1: '100 Market Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
  }

  async function commerce() {
    const user = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    return createPostgresCommerceService(payload, user)
  }

  async function prepareCart(qty = POOL_MAX) {
    const svc = await commerce()
    for (const line of await svc.getCart(pacificCompanyId)) {
      await svc.removeCartLine(pacificCompanyId, line.sku)
    }
    await svc.setCartLine(pacificCompanyId, SEED_HERO_SKU, qty)
  }

  beforeEach(async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const svc = await commerce()
    for (const line of await svc.getCart(pacificCompanyId)) {
      await svc.removeCartLine(pacificCompanyId, line.sku)
    }
  })

  it(
    'parallel submit with the same idempotency key creates one order',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      await prepareCart(2)
      const svc = await commerce()
      const key = `checkout-same-key-${Date.now()}`
      const po = `PO-SAME-${Date.now()}`
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          svc.submitCartCheckout(pacificCompanyId, {
            poNumber: po,
            shipTo,
            idempotencyKey: key,
          }),
        ),
      )
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
      const fulfilled = results as PromiseFulfilledResult<Awaited<ReturnType<typeof svc.submitCartCheckout>>>[]
      const orderIds = new Set(fulfilled.map((r) => r.value.id))
      expect(orderIds.size).toBe(1)
      const orders = await payload.find({
        collection: 'orders',
        where: {
          and: [
            { company: { equals: Number(pacificCompanyId) } },
            { idempotencyKey: { equals: key } },
          ],
        },
        limit: 10,
        overrideAccess: true,
      })
      expect(orders.docs).toHaveLength(1)
      const cart = await svc.getCart(pacificCompanyId)
      expect(cart).toHaveLength(0)
    },
    120_000,
  )

  it(
    'parallel submit with different keys yields one order and validation errors',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      await prepareCart(1)
      const svc = await commerce()
      const stamp = Date.now()
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          svc.submitCartCheckout(pacificCompanyId, {
            poNumber: `PO-MULTI-${stamp}-${i}`,
            shipTo,
            idempotencyKey: `checkout-diff-${stamp}-${i}`,
          }),
        ),
      )
      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected.length).toBeGreaterThanOrEqual(4)
      for (const r of rejected) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(CartValidationError)
      }
      const orders = await payload.find({
        collection: 'orders',
        where: { company: { equals: Number(pacificCompanyId) } },
        limit: 50,
        overrideAccess: true,
      })
      const created = orders.docs.filter((o) => String(o.idempotencyKey ?? '').startsWith(`checkout-diff-${stamp}`))
      expect(created).toHaveLength(1)
      const cartLines = await svc.getCart(pacificCompanyId)
      expect(cartLines).toHaveLength(0)
    },
    120_000,
  )

  it(
    'parallel quote conversion with different keys yields one order linked to quote',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const svc = await commerce()
      const quotes = await svc.listQuotes(pacificCompanyId)
      const quote = quotes.find((q) => q.quoteNumber === SEED_QUOTE_NUMBER)
      expect(quote).toBeDefined()
      await payload.update({
        collection: 'quotes',
        id: Number(quote!.id),
        data: {
          convertedOrder: null,
          status: 'accepted',
        },
        overrideAccess: true,
      })
      const stamp = Date.now()
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          svc.convertQuoteToOrder(pacificCompanyId, quote!.id, {
            poNumber: `PO-QPAR-${stamp}-${i}`,
            shipTo,
            idempotencyKey: `quote-par-${stamp}-${i}`,
          }),
        ),
      )
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
      const fulfilled = results as PromiseFulfilledResult<Awaited<ReturnType<typeof svc.convertQuoteToOrder>>>[]
      const orderIds = new Set(fulfilled.map((r) => r.value.id))
      expect(orderIds.size).toBe(1)
      const linked = await payload.find({
        collection: 'orders',
        where: { quote: { equals: Number(quote!.id) } },
        limit: 50,
        overrideAccess: true,
      })
      const fromRun = linked.docs.filter((o) =>
        String(o.idempotencyKey ?? '').startsWith(`quote-par-${stamp}`),
      )
      expect(fromRun).toHaveLength(1)
    },
    120_000,
  )
})
