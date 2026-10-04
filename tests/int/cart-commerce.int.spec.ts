// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { CartValidationError, createPostgresCommerceService } from '@/commerce/postgres'
import { createPayloadReq } from '@/lib/payload-req'
import { SEED_HERO_SKU, SEED_QUOTE_SECOND_SKU } from '@/scripts/seed'

const HIDDEN_SKU = '4279300.002'
const DISCONTINUED_SKU = '7353101.278'

describe('cart commerce', () => {
  let payload: Payload
  let pacificUserId: number
  let bayUserId: number
  let pacificCompanyId: string
  let bayCompanyId: string

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

  async function pacificUserDoc() {
    return payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
  }

  async function bayUserDoc() {
    return payload.findByID({ collection: 'users', id: bayUserId, overrideAccess: true })
  }

  async function deletePacificCartDoc() {
    const carts = await payload.find({
      collection: 'carts',
      where: {
        and: [{ user: { equals: pacificUserId } }, { company: { equals: Number(pacificCompanyId) } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (carts.docs[0]) {
      await payload.delete({ collection: 'carts', id: carts.docs[0].id, overrideAccess: true })
    }
  }

  async function clearPacificCart() {
    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    const lines = await commerce.getCart(pacificCompanyId)
    for (const line of lines) {
      await commerce.removeCartLine(pacificCompanyId, line.sku)
    }
  }

  it('stores cart lines for the authenticated vendor user', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    await clearPacificCart()
    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await commerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 3)
    const cart = await commerce.getCart(pacificCompanyId)
    expect(cart).toEqual([{ sku: SEED_HERO_SKU, quantity: 3 }])

    const summary = await commerce.getCartSummary(pacificCompanyId)
    expect(summary.lines[0]?.available).toBe(true)
    expect(summary.lines[0]?.unitPrice?.amount).toBe(199)
    expect(summary.subtotal).toBe(199 * 3)

    await clearPacificCart()
  })

  it('rejects non-integer and out-of-range quantities', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await expect(commerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 10.5)).rejects.toBeInstanceOf(
      CartValidationError,
    )
    await expect(commerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 1e12)).rejects.toBeInstanceOf(
      CartValidationError,
    )
  })

  it('enforces MOQ and order multiple on the server', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await expect(
      commerce.setCartLine(pacificCompanyId, SEED_QUOTE_SECOND_SKU, 5),
    ).rejects.toBeInstanceOf(CartValidationError)
  })

  it('rejects hidden catalog and discontinued SKUs on add', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await expect(commerce.setCartLine(pacificCompanyId, HIDDEN_SKU, 1)).rejects.toMatchObject({
      message: expect.stringMatching(/not available to order/i),
    })
    await expect(commerce.setCartLine(pacificCompanyId, DISCONTINUED_SKU, 1)).rejects.toMatchObject({
      message: expect.stringMatching(/discontinued/i),
    })
  })

  it('survives a discontinued line: summary, remove, and other lines remain editable', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    await clearPacificCart()
    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await commerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 2)
    await commerce.setCartLine(pacificCompanyId, SEED_QUOTE_SECOND_SKU, 6)

    const variant = await payload.find({
      collection: 'product-variants',
      where: { sku: { equals: SEED_QUOTE_SECOND_SKU } },
      limit: 1,
      overrideAccess: true,
    })
    const variantId = variant.docs[0]!.id
    await payload.update({
      collection: 'product-variants',
      id: variantId,
      data: { discontinued: true },
      overrideAccess: true,
    })

    try {
      const summary = await commerce.getCartSummary(pacificCompanyId)
      expect(summary.lines).toHaveLength(2)
      const hero = summary.lines.find((l) => l.sku === SEED_HERO_SKU)
      const blocked = summary.lines.find((l) => l.sku === SEED_QUOTE_SECOND_SKU)
      expect(hero?.available).toBe(true)
      expect(blocked?.available).toBe(false)
      expect(summary.subtotal).toBe(199 * 2)

      await commerce.removeCartLine(pacificCompanyId, SEED_QUOTE_SECOND_SKU)
      await commerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 4)
      const after = await commerce.getCartSummary(pacificCompanyId)
      expect(after.lines).toHaveLength(1)
      expect(after.lines[0]?.quantity).toBe(4)
      expect(after.subtotal).toBe(199 * 4)
    } finally {
      await payload.update({
        collection: 'product-variants',
        id: variantId,
        data: { discontinued: false },
        overrideAccess: true,
      })
      await clearPacificCart()
    }
  })

  it('retries cart create when two empty-cart lookups race', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    await deletePacificCartDoc()
    const user = await pacificUserDoc()
    const a = createPostgresCommerceService(payload, user)
    const b = createPostgresCommerceService(payload, user)
    await Promise.all([a.getCart(pacificCompanyId), b.getCart(pacificCompanyId)])
    const carts = await payload.find({
      collection: 'carts',
      where: {
        and: [{ user: { equals: pacificUserId } }, { company: { equals: Number(pacificCompanyId) } }],
      },
      limit: 10,
      overrideAccess: true,
    })
    expect(carts.docs).toHaveLength(1)
    await deletePacificCartDoc()
  })

  it('blocks another vendor company from reading or mutating the cart', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    await clearPacificCart()
    const pacificCommerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await pacificCommerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 1)

    const bayCommerce = createPostgresCommerceService(payload, await bayUserDoc())
    await expect(bayCommerce.getCart(pacificCompanyId)).rejects.toThrow(/does not match/)
    await expect(bayCommerce.setCartLine(pacificCompanyId, SEED_HERO_SKU, 2)).rejects.toThrow(
      /does not match/,
    )

    const pacificCart = await payload.find({
      collection: 'carts',
      where: {
        and: [{ user: { equals: pacificUserId } }, { company: { equals: Number(pacificCompanyId) } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    const cartId = pacificCart.docs[0]!.id
    const bayUser = await bayUserDoc()
    await expect(
      payload.find({
        collection: 'carts',
        where: { id: { equals: cartId } },
        overrideAccess: false,
        req: createPayloadReq(payload, bayUser),
      }),
    ).rejects.toThrow(/not allowed|Forbidden/i)

    await clearPacificCart()
  })
})
