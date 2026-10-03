// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPostgresCommerceService } from '@/commerce/postgres'
import { SEED_HERO_SKU } from '@/scripts/seed'

const POOL_MAX = Number(process.env.DB_POOL_MAX ?? 5)

/** Ten orderable SKUs (qty 1 allowed); excludes {@link SEED_HERO_SKU} used for concurrent +1 increments. */
const CONCURRENT_SKUS = [
  '7353101.013',
  '7353101.295',
  '7353101.243',
  '7455207.002',
  '7105801.243',
  '7105801.002',
  '7105801.295',
  '7105801.GN0',
  '7018801.002',
  '7018801.295',
]

describe('cart concurrency', () => {
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

  async function commerce() {
    const user = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    return createPostgresCommerceService(payload, user)
  }

  async function clearCartLines() {
    const svc = await commerce()
    for (const line of await svc.getCart(pacificCompanyId)) {
      await svc.removeCartLine(pacificCompanyId, line.sku)
    }
  }

  async function deleteCartDoc() {
    const existing = await payload.find({
      collection: 'carts',
      where: {
        and: [
          { user: { equals: pacificUserId } },
          { company: { equals: Number(pacificCompanyId) } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      await payload.delete({
        collection: 'carts',
        id: existing.docs[0].id,
        overrideAccess: true,
      })
    }
  }

  beforeEach(async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCartLines()
  })

  it(
    'mixed 10 SKU lines plus 10 increments completes exactly (5 repeats)',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      for (let run = 0; run < 5; run++) {
        await clearCartLines()
        const svc = await commerce()
        await Promise.all([
          ...CONCURRENT_SKUS.map((sku) => svc.setCartLine(pacificCompanyId, sku, 1)),
          ...Array.from({ length: 10 }, () => svc.addCartQuantity(pacificCompanyId, SEED_HERO_SKU, 1)),
        ])
        const cart = await svc.getCart(pacificCompanyId)
        expect(cart).toHaveLength(CONCURRENT_SKUS.length + 1)
        for (const sku of CONCURRENT_SKUS) {
          expect(cart.find((l) => l.sku === sku)?.quantity).toBe(1)
        }
        expect(cart.find((l) => l.sku === SEED_HERO_SKU)?.quantity).toBe(10)
      }
    },
    120_000,
  )

  it(
    '3x pool size concurrent +1 increments sum exactly',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const workers = POOL_MAX * 3
      const svc = await commerce()
      await Promise.all(
        Array.from({ length: workers }, () => svc.addCartQuantity(pacificCompanyId, SEED_HERO_SKU, 1)),
      )
      const cart = await svc.getCart(pacificCompanyId)
      expect(cart).toHaveLength(1)
      expect(cart[0]!.quantity).toBe(workers)
    },
    60_000,
  )

  it(
    'first-time cart race keeps all lines with one cart row',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const raceSkus = CONCURRENT_SKUS.slice(0, 2)
      await deleteCartDoc()
      let svc = await commerce()
      await Promise.all(raceSkus.map((sku) => svc.setCartLine(pacificCompanyId, sku, 1)))
      let carts = await payload.find({
        collection: 'carts',
        where: {
          and: [
            { user: { equals: pacificUserId } },
            { company: { equals: Number(pacificCompanyId) } },
          ],
        },
        limit: 5,
        overrideAccess: true,
      })
      expect(carts.docs).toHaveLength(1)
      let lines = await svc.getCart(pacificCompanyId)
      expect(lines).toHaveLength(2)

      await deleteCartDoc()
      const fiveSkus = CONCURRENT_SKUS.slice(0, 5)
      svc = await commerce()
      await Promise.all(fiveSkus.map((sku) => svc.setCartLine(pacificCompanyId, sku, 1)))
      carts = await payload.find({
        collection: 'carts',
        where: {
          and: [
            { user: { equals: pacificUserId } },
            { company: { equals: Number(pacificCompanyId) } },
          ],
        },
        limit: 5,
        overrideAccess: true,
      })
      expect(carts.docs).toHaveLength(1)
      lines = await svc.getCart(pacificCompanyId)
      expect(lines).toHaveLength(5)
    },
    60_000,
  )

  it(
    'quick-order same-key concurrency applies once',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      await clearCartLines()
      const svc = await commerce()
      const lines = [{ lineNumber: 1, sku: SEED_HERO_SKU, quantity: 2 }]
      const key = `cart-concurrency-qo-${Date.now()}`
      const results = await Promise.all([
        svc.applyQuickOrder(pacificCompanyId, lines, key),
        svc.applyQuickOrder(pacificCompanyId, lines, key),
        svc.applyQuickOrder(pacificCompanyId, lines, key),
      ])
      expect(results.filter((r) => !r.replay).length).toBe(1)
      expect(results.filter((r) => r.replay).length).toBeGreaterThanOrEqual(2)
      const cart = await svc.getCart(pacificCompanyId)
      expect(cart.find((l) => l.sku === SEED_HERO_SKU)?.quantity).toBe(2)
      const rows = await payload.find({
        collection: 'cart-bulk-adds',
        where: { idempotencyKey: { equals: key } },
        limit: 5,
        overrideAccess: true,
      })
      expect(rows.docs).toHaveLength(1)
    },
    30_000,
  )
})
