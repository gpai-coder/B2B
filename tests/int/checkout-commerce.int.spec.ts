// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPostgresCommerceService } from '@/commerce/postgres'
import { SEED_HERO_SKU } from '@/scripts/seed'

type CreateArgs = Parameters<Payload['create']>[0]

async function txState(payload: Payload, args: CreateArgs) {
  let txId = args.req?.transactionID
  if (txId != null && typeof (txId as Promise<unknown>).then === 'function') {
    txId = await txId
  }
  const key = txId == null ? null : String(txId)
  const sessions = payload.db.sessions ?? {}
  const live = key != null && Object.prototype.hasOwnProperty.call(sessions, key)
  return { txId: key, live }
}

describe('checkout commerce', () => {
  let payload: Payload
  let pacificCompanyId: string
  let pacificUserId: number
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
    pacificUserId = pacificUser.docs[0]!.id
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
    ).rejects.toMatchObject({
      message: 'PO number is already used for this company.',
    })
  })

  it('duplicate PO attempts exactly one in-transaction order create', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const svc = await pacificCommerce()
    const po = `PO-SPY-${Date.now()}`
    await svc.setCartLine(pacificCompanyId, SEED_HERO_SKU, 1)
    await svc.submitCartCheckout(pacificCompanyId, {
      poNumber: po,
      shipTo: pacificShipTo,
      idempotencyKey: `po-spy-1-${Date.now()}`,
    })
    await svc.setCartLine(pacificCompanyId, SEED_HERO_SKU, 1)

    const baseCreate = payload.create.bind(payload)
    const orderCreateStates: Array<{ txId: string | null; live: boolean }> = []
    const createSpy = vi.spyOn(payload, 'create').mockImplementation(async (args) => {
      if (args.collection === 'orders') {
        orderCreateStates.push(await txState(payload, args))
      }
      return baseCreate(args)
    })

    try {
      await expect(
        svc.submitCartCheckout(pacificCompanyId, {
          poNumber: po,
          shipTo: pacificShipTo,
          idempotencyKey: `po-spy-2-${Date.now()}`,
        }),
      ).rejects.toMatchObject({
        message: 'PO number is already used for this company.',
      })
      expect(orderCreateStates).toHaveLength(1)
      expect(orderCreateStates[0]!.live).toBe(true)
    } finally {
      createSpy.mockRestore()
    }
  })

  it('retries order-number collision in a fresh transaction and clears cart once', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const svc = await pacificCommerce()
    await svc.setCartLine(pacificCompanyId, SEED_HERO_SKU, 2)
    const key = `ord-coll-${Date.now()}`
    const po = `PO-COLL-${Date.now()}`

    const existingOrders = await payload.find({
      collection: 'orders',
      limit: 1,
      overrideAccess: true,
    })
    const takenOrderNumber = existingOrders.docs[0]?.orderNumber
    expect(takenOrderNumber).toBeTruthy()

    const baseCreate = payload.create.bind(payload)
    const orderCreateStates: Array<{ txId: string | null; live: boolean }> = []
    let orderCreateCalls = 0
    const createSpy = vi.spyOn(payload, 'create').mockImplementation(async (args) => {
      if (args.collection === 'orders') {
        orderCreateCalls++
        orderCreateStates.push(await txState(payload, args))
        if (orderCreateCalls === 1) {
          const collisionArgs = {
            ...args,
            data: { ...(args.data as Record<string, unknown>), orderNumber: takenOrderNumber },
          }
          return baseCreate(collisionArgs as CreateArgs)
        }
      }
      return baseCreate(args)
    })

    try {
      const order = await svc.submitCartCheckout(pacificCompanyId, {
        poNumber: po,
        shipTo: pacificShipTo,
        idempotencyKey: key,
      })
      expect(order.id).toBeTruthy()
      expect(orderCreateCalls).toBe(2)
      expect(orderCreateStates).toHaveLength(2)
      expect(orderCreateStates[0]!.live).toBe(true)
      expect(orderCreateStates[1]!.live).toBe(true)
      expect(orderCreateStates[1]!.txId).not.toBe(orderCreateStates[0]!.txId)
      const cart = await svc.getCart(pacificCompanyId)
      expect(cart).toHaveLength(0)
      const rows = await payload.find({
        collection: 'orders',
        where: {
          and: [
            { company: { equals: Number(pacificCompanyId) } },
            { idempotencyKey: { equals: key } },
          ],
        },
        limit: 5,
        overrideAccess: true,
      })
      expect(rows.docs).toHaveLength(1)
    } finally {
      createSpy.mockRestore()
    }
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
    const bayOrder = await payload.create({
      collection: 'orders',
      data: {
        company: Number(bayCompanyId),
        status: 'submitted',
        orderNumber: `ISO-BAY-${Date.now()}`,
        poNumber: `PO-ISO-BAY-${Date.now()}`,
        shipTo: pacificShipTo,
        lines: [{ sku: SEED_HERO_SKU, quantity: 1, unitPrice: 10 }],
      },
      overrideAccess: true,
    })
    const pacificUser = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    const pacificSvcRead = createPostgresCommerceService(payload, pacificUser)
    await expect(pacificSvcRead.getOrder(String(bayOrder.id), pacificCompanyId)).resolves.toBeNull()
    await payload.delete({ collection: 'orders', id: bayOrder.id, overrideAccess: true })
  })
})
