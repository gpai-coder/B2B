// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPostgresCommerceService } from '@/commerce/postgres'
import { SEED_HERO_SKU, SEED_QUOTE_SECOND_SKU } from '@/scripts/seed'

describe('quick order commerce', () => {
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

  async function pacificUser() {
    return payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
  }

  async function clearCart() {
    const commerce = createPostgresCommerceService(payload, await pacificUser())
    for (const line of await commerce.getCart(pacificCompanyId)) {
      await commerce.removeCartLine(pacificCompanyId, line.sku)
    }
  }

  it('flags hidden SKU as unknown without leaking catalog', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const commerce = createPostgresCommerceService(payload, await pacificUser())
    const preview = await commerce.previewQuickOrder(pacificCompanyId, [
      { lineNumber: 1, sku: '4279300.002', quantity: 1 },
    ])
    expect(preview.lines[0]?.ok).toBe(false)
    expect(preview.lines[0]?.error).toBe('Unknown SKU.')
  })

  it('apply is idempotent for the same key', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCart()
    const commerce = createPostgresCommerceService(payload, await pacificUser())
    const lines = [{ lineNumber: 1, sku: SEED_HERO_SKU, quantity: 2 }]
    const key = `quick-order-test-${Date.now()}`
    const first = await commerce.applyQuickOrder(pacificCompanyId, lines, key)
    expect(first.replay).toBe(false)
    const cartAfterFirst = await commerce.getCart(pacificCompanyId)
    expect(cartAfterFirst.find((l) => l.sku === SEED_HERO_SKU)?.quantity).toBe(2)

    const second = await commerce.applyQuickOrder(pacificCompanyId, lines, key)
    expect(second.replay).toBe(true)
    const cartAfterSecond = await commerce.getCart(pacificCompanyId)
    expect(cartAfterSecond.find((l) => l.sku === SEED_HERO_SKU)?.quantity).toBe(2)
    await clearCart()
  })

  it('blocks cross-company quick order apply', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const bay = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_B_EMAIL ?? 'buyer@bay-fixtures.local' } },
      limit: 1,
      overrideAccess: true,
    })
    const bayUser = bay.docs[0]!
    const commerce = createPostgresCommerceService(payload, bayUser)
    await expect(
      commerce.applyQuickOrder(pacificCompanyId, [{ lineNumber: 1, sku: SEED_HERO_SKU, quantity: 1 }], 'x'),
    ).rejects.toThrow(/does not match/)
  })

  it('concurrent same-key applies write once and replay others', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCart()
    const commerce = createPostgresCommerceService(payload, await pacificUser())
    const lines = [{ lineNumber: 1, sku: SEED_HERO_SKU, quantity: 3 }]
    const key = `quick-order-concurrent-${Date.now()}`
    const results = await Promise.all([
      commerce.applyQuickOrder(pacificCompanyId, lines, key),
      commerce.applyQuickOrder(pacificCompanyId, lines, key),
      commerce.applyQuickOrder(pacificCompanyId, lines, key),
    ])
    const replays = results.filter((r) => r.replay).length
    expect(replays).toBeGreaterThanOrEqual(2)
    expect(results.some((r) => !r.replay)).toBe(true)
    const cart = await commerce.getCart(pacificCompanyId)
    expect(cart.find((l) => l.sku === SEED_HERO_SKU)?.quantity).toBe(3)
    const rows = await payload.find({
      collection: 'cart-bulk-adds',
      where: { idempotencyKey: { equals: key } },
      limit: 10,
      overrideAccess: true,
    })
    expect(rows.docs).toHaveLength(1)
    await clearCart()
  })

  it('does not write cart or idempotency row when merged qty exceeds max', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    await clearCart()
    const commerce = createPostgresCommerceService(payload, await pacificUser())
    await commerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 9998)
    const key = `quick-order-max-${Date.now()}`
    await expect(
      commerce.applyQuickOrder(
        pacificCompanyId,
        [{ lineNumber: 1, sku: SEED_HERO_SKU, quantity: 3 }],
        key,
      ),
    ).rejects.toThrow(/9999/)
    const cart = await commerce.getCart(pacificCompanyId)
    expect(cart.find((l) => l.sku === SEED_HERO_SKU)?.quantity).toBe(9998)
    const rows = await payload.find({
      collection: 'cart-bulk-adds',
      where: { idempotencyKey: { equals: key } },
      limit: 1,
      overrideAccess: true,
    })
    expect(rows.docs).toHaveLength(0)
    await clearCart()
  })

  it('enforces MOQ on preview', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const commerce = createPostgresCommerceService(payload, await pacificUser())
    const preview = await commerce.previewQuickOrder(pacificCompanyId, [
      { lineNumber: 1, sku: SEED_QUOTE_SECOND_SKU, quantity: 5 },
    ])
    expect(preview.lines[0]?.ok).toBe(false)
    expect(preview.lines[0]?.error).toMatch(/Minimum|multiples/i)
  })
})
