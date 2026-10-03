// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPostgresCommerceService } from '@/commerce/postgres'
import { SEED_HERO_SKU } from '@/scripts/seed'

const CONCURRENT_SKUS = [
  '7353101.002',
  '7353101.013',
  '7353101.295',
  '7353101.243',
  '7455207.002',
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

  async function clearCart() {
    const svc = await commerce()
    for (const line of await svc.getCart(pacificCompanyId)) {
      await svc.removeCartLine(pacificCompanyId, line.sku)
    }
  }

  beforeEach(async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCart()
  })

  it(
    'keeps all lines when 10 concurrent adds target different SKUs',
    async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCart()
    const svc = await commerce()
    await Promise.all(
      CONCURRENT_SKUS.map((sku) => svc.setCartLine(pacificCompanyId, sku, 1)),
    )
    const cart = await svc.getCart(pacificCompanyId)
    expect(cart).toHaveLength(CONCURRENT_SKUS.length)
    for (const sku of CONCURRENT_SKUS) {
      expect(cart.find((l) => l.sku === sku)?.quantity).toBe(1)
    }
    await clearCart()
  },
    30_000,
  )

  it(
    'sums quantities when 10 concurrent increments hit the same SKU',
    async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCart()
    const svc = await commerce()
    await Promise.all(
      Array.from({ length: 10 }, () => svc.addCartQuantity(pacificCompanyId, SEED_HERO_SKU, 1)),
    )
    const cart = await svc.getCart(pacificCompanyId)
    expect(cart).toHaveLength(1)
    expect(cart[0]!.sku).toBe(SEED_HERO_SKU)
    expect(cart[0]!.quantity).toBe(10)
    await clearCart()
  },
    30_000,
  )
})
