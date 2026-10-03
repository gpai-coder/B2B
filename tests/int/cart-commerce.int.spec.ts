// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { CartValidationError, createPostgresCommerceService } from '@/commerce/postgres'
import { createPayloadReq } from '@/lib/payload-req'
import { SEED_HERO_SKU, SEED_QUOTE_SECOND_SKU } from '@/scripts/seed'

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
    expect(summary.lines[0]?.unitPrice.amount).toBe(199)
    expect(summary.subtotal).toBe(199 * 3)

    await clearPacificCart()
  })

  it('enforces MOQ and order multiple on the server', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await expect(
      commerce.setCartLine(pacificCompanyId, SEED_QUOTE_SECOND_SKU, 5),
    ).rejects.toBeInstanceOf(CartValidationError)
  })

  it('rejects hidden catalog and discontinued SKUs', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const commerce = createPostgresCommerceService(payload, await pacificUserDoc())
    await expect(commerce.setCartLine(pacificCompanyId, '4279300.002', 1)).rejects.toBeInstanceOf(
      CartValidationError,
    )
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
    const leaked = await payload.find({
      collection: 'carts',
      where: { id: { equals: cartId } },
      overrideAccess: false,
      req: createPayloadReq(payload, bayUser),
    })
    expect(leaked.docs).toHaveLength(0)

    await clearPacificCart()
  })
})
