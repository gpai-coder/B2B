// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload, type PayloadRequest } from 'payload'

import config from '@/payload.config'
import { createPostgresCommerceService } from '@/commerce/postgres'
import { createPayloadReq } from '@/lib/payload-req'
import {
  assertValidQuoteStatusTransition,
  QuoteTransitionConflictError,
} from '@/lib/quotes/quote-workflow'
import { staffQuoteUpdate } from '@/lib/quotes/staff-quote-update'

const POOL_MAX = Number(process.env.DB_POOL_MAX ?? 5)
const RACE_ROUNDS = 60

const VALID_TRANSITIONS: Array<[string, string]> = [
  ['draft', 'sent'],
  ['sent', 'accepted'],
  ['sent', 'expired'],
  ['sent', 'withdrawn'],
  ['accepted', 'expired'],
  ['accepted', 'withdrawn'],
]

function apiStatus(err: unknown): number | undefined {
  return (err as { status?: number }).status
}

function expectQuoteRaceResults(results: PromiseSettledResult<unknown>[], poolSize: number) {
  const ok = results.filter((r) => r.status === 'fulfilled')
  const fail409 = results.filter(
    (r) => r.status === 'rejected' && apiStatus((r as PromiseRejectedResult).reason) === 409,
  )
  expect(ok.length).toBe(1)
  expect(fail409.length).toBe(poolSize - 1)
  expect(
    results.every((r) =>
      r.status === 'rejected' ? apiStatus((r as PromiseRejectedResult).reason) !== 500 : true,
    ),
  ).toBe(true)
}

async function deleteQuoteAndOrder(payload: Payload, quoteId: number, convertedOrder: unknown) {
  if (convertedOrder != null && convertedOrder !== '') {
    const orderId =
      typeof convertedOrder === 'object'
        ? (convertedOrder as { id: number }).id
        : Number(convertedOrder)
    const events = await payload.find({
      collection: 'order-events',
      where: { order: { equals: orderId } },
      limit: 500,
      overrideAccess: true,
    })
    for (const row of events.docs) {
      await payload.delete({ collection: 'order-events', id: row.id, overrideAccess: true })
    }
    await payload.delete({ collection: 'orders', id: orderId, overrideAccess: true })
  }
  await payload.delete({ collection: 'quotes', id: quoteId, overrideAccess: true })
}

describe('staff quote builder (PR B)', () => {
  let payload: Payload
  let pacificCompanyId: number
  let pacificUserId: number
  let staffUserId: number
  let variantId: number

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
    const pacific = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Pacific Plumbing Supply' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificCompanyId = pacific.docs[0]!.id
    const pacificUser = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local' } },
      limit: 1,
      overrideAccess: true,
    })
    const staff = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificUserId = pacificUser.docs[0]!.id
    staffUserId = staff.docs[0]!.id
    const variant = await payload.find({
      collection: 'product-variants',
      where: { sku: { equals: '7353101.002' } },
      limit: 1,
      overrideAccess: true,
    })
    variantId = variant.docs[0]!.id
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  async function staffReq() {
    const staff = await payload.findByID({ collection: 'users', id: staffUserId, overrideAccess: true })
    return createPayloadReq(payload, staff)
  }

  async function vendorReq() {
    const user = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    return createPayloadReq(payload, user)
  }

  async function staffPayloadUpdate(req: PayloadRequest, quoteId: number, data: Record<string, unknown>) {
    return payload.update({
      collection: 'quotes',
      id: quoteId,
      data,
      req,
      overrideAccess: false,
    })
  }

  async function deleteTestQuote(quoteId: number) {
    await payload.delete({ collection: 'quotes', id: quoteId, overrideAccess: true })
  }

  async function createDraftQuote(label: string) {
    return payload.create({
      collection: 'quotes',
      data: {
        quoteNumber: `Q-TEST-${label}-${Date.now()}`,
        company: pacificCompanyId,
        status: 'draft',
        expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        lines: [{ sku: '7353101.002', variant: variantId, quantity: 1, unitPrice: 10 }],
        notes: label,
      },
      overrideAccess: true,
    })
  }

  it('allows only the configured quote status transition matrix', () => {
    for (const [from, to] of VALID_TRANSITIONS) {
      expect(() => assertValidQuoteStatusTransition(from as never, to as never)).not.toThrow()
    }
    expect(() => assertValidQuoteStatusTransition('sent', 'draft')).toThrow(QuoteTransitionConflictError)
    expect(() => assertValidQuoteStatusTransition('withdrawn', 'sent')).toThrow(QuoteTransitionConflictError)
  })

  it('generates quoteNumber and default expiry on staff create', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const created = (await payload.create({
      collection: 'quotes',
      data: {
        company: pacificCompanyId,
        status: 'draft',
        expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        lines: [{ sku: '7353101.002', variant: variantId, quantity: 1, unitPrice: 0 }],
      },
      req,
      overrideAccess: false,
    } as Parameters<Payload['create']>[0])) as import('@/payload-types').Quote
    expect(String(created.quoteNumber ?? '')).toMatch(/^Q-\d{4}-\d{6}$/)
    expect(created.expiresAt).toBeTruthy()
    const expires = new Date(String(created.expiresAt))
    const diffDays = (expires.getTime() - Date.now()) / 86400000
    expect(diffDays).toBeGreaterThan(25)
    expect(diffDays).toBeLessThan(35)
    await deleteTestQuote(created.id)
  })

  it('returns 400 for frozen field changes with overrideAccess: false', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const draft = await createDraftQuote('frozen')
    await staffPayloadUpdate(req, draft.id, { status: 'sent' })
    await expect(
      staffPayloadUpdate(req, draft.id, {
        lines: [{ sku: '7353101.002', variant: variantId, quantity: 2, unitPrice: 10 }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    await deleteTestQuote(draft.id)
  })

  it('hides draft quotes from vendors', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const draft = await createDraftQuote('vendor-hide')
    const vendor = await vendorReq()
    const list = await payload.find({
      collection: 'quotes',
      where: { company: { equals: pacificCompanyId } },
      limit: 100,
      req: vendor,
      overrideAccess: false,
    })
    expect(list.docs.some((q) => q.id === draft.id)).toBe(false)
    await expect(
      payload.findByID({ collection: 'quotes', id: draft.id, req: vendor, overrideAccess: false }),
    ).rejects.toMatchObject({ status: 404 })
    await deleteTestQuote(draft.id)
  })

  function anonymousReq() {
    return createPayloadReq(payload, null)
  }

  it('does not leak quotes via frozen-field oracle to anonymous callers', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const draft = await createDraftQuote('oracle-anon')
    await staffPayloadUpdate(await staffReq(), draft.id, { status: 'sent' })
    const anon = anonymousReq()
    await expect(
      payload.update({
        collection: 'quotes',
        id: draft.id,
        data: { lines: [{ sku: 'X', quantity: 1, unitPrice: 1 }] },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'quotes',
        id: draft.id,
        data: { lines: draft.lines },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'quotes',
        id: 999_999_999,
        data: { notes: 'x' },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'quotes',
        where: { notes: { equals: 'oracle-anon' } },
        data: { notes: 'hack' },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await deleteTestQuote(draft.id)
  })

  it('does not leak quotes via frozen-field oracle to vendor callers', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const draft = await createDraftQuote('oracle-vendor')
    const req = await staffReq()
    await staffPayloadUpdate(req, draft.id, { status: 'sent' })
    const vendor = await vendorReq()
    await expect(
      payload.update({
        collection: 'quotes',
        id: draft.id,
        data: { lines: [{ sku: 'HACK', quantity: 1, unitPrice: 1 }] },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'quotes',
        id: draft.id,
        data: { notes: 'ok' },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'quotes',
        id: 999_999_999,
        data: { notes: 'x' },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'quotes',
        where: { notes: { equals: 'oracle-vendor' } },
        data: { notes: 'hack' },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await deleteTestQuote(draft.id)
  })

  it(
    'vendor convert racing staff withdraw yields one winner without 500 or deadlock',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const vendorUser = await payload.findByID({
        collection: 'users',
        id: pacificUserId,
        overrideAccess: true,
      })
      const commerce = createPostgresCommerceService(payload, vendorUser)
      const shipTo = {
        name: 'Test',
        line1: '1 Main',
        city: 'SF',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      }

      for (let round = 0; round < RACE_ROUNDS; round++) {
        const draft = await createDraftQuote(`race-${round}`)
        const staff = await staffReq()
        await staffPayloadUpdate(staff, draft.id, { status: 'sent' })
        await staffPayloadUpdate(staff, draft.id, { status: 'accepted' })

        const staffUser = await payload.findByID({
          collection: 'users',
          id: staffUserId,
          overrideAccess: true,
        })
        const staffReqs = Array.from({ length: POOL_MAX - 1 }, () => createPayloadReq(payload, staffUser))

        const results = await Promise.allSettled([
          commerce.convertQuoteToOrder(String(pacificCompanyId), String(draft.id), {
            poNumber: `PO-RACE-${round}-${Date.now()}`,
            shipTo,
            idempotencyKey: `race-convert-${round}-${Date.now()}`,
          }),
          ...staffReqs.map((r) => staffQuoteUpdate(payload, r, draft.id, { status: 'withdrawn' })),
        ])

        expectQuoteRaceResults(results, POOL_MAX)

        const fresh = await payload.findByID({ collection: 'quotes', id: draft.id, overrideAccess: true })
        const converted = fresh.convertedOrder != null
        const withdrawn = fresh.status === 'withdrawn'
        expect(converted || withdrawn).toBe(true)
        if (converted && withdrawn) {
          expect.fail('Quote cannot be both converted and withdrawn')
        }

        if (converted) {
          await deleteQuoteAndOrder(payload, draft.id, fresh.convertedOrder)
        } else {
          await deleteTestQuote(draft.id)
        }
      }
    },
    360_000,
  )

  it(
    'vendor convert racing staff expire yields one winner without 500 or deadlock',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const vendorUser = await payload.findByID({
        collection: 'users',
        id: pacificUserId,
        overrideAccess: true,
      })
      const commerce = createPostgresCommerceService(payload, vendorUser)
      const shipTo = {
        name: 'Test',
        line1: '1 Main',
        city: 'SF',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      }

      for (let round = 0; round < RACE_ROUNDS; round++) {
        const draft = await createDraftQuote(`race-exp-${round}`)
        const staff = await staffReq()
        await staffPayloadUpdate(staff, draft.id, { status: 'sent' })
        await staffPayloadUpdate(staff, draft.id, { status: 'accepted' })

        const staffUser = await payload.findByID({
          collection: 'users',
          id: staffUserId,
          overrideAccess: true,
        })
        const staffReqs = Array.from({ length: POOL_MAX - 1 }, () => createPayloadReq(payload, staffUser))

        const results = await Promise.allSettled([
          commerce.convertQuoteToOrder(String(pacificCompanyId), String(draft.id), {
            poNumber: `PO-EXP-${round}-${Date.now()}`,
            shipTo,
            idempotencyKey: `race-exp-convert-${round}-${Date.now()}`,
          }),
          ...staffReqs.map((r) => staffQuoteUpdate(payload, r, draft.id, { status: 'expired' })),
        ])

        expectQuoteRaceResults(results, POOL_MAX)
        const fresh = await payload.findByID({ collection: 'quotes', id: draft.id, overrideAccess: true })
        const converted = fresh.convertedOrder != null
        const expired = fresh.status === 'expired'
        expect(converted || expired).toBe(true)
        await deleteQuoteAndOrder(payload, draft.id, fresh.convertedOrder)
      }
    },
    360_000,
  )

  it(
    'parallel convert with the same idempotency key yields one order',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const vendorUser = await payload.findByID({
        collection: 'users',
        id: pacificUserId,
        overrideAccess: true,
      })
      const commerce = createPostgresCommerceService(payload, vendorUser)
      const shipTo = {
        name: 'Test',
        line1: '1 Main',
        city: 'SF',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      }

      for (let round = 0; round < RACE_ROUNDS; round++) {
        const draft = await createDraftQuote(`race-dbl-${round}`)
        const staff = await staffReq()
        await staffPayloadUpdate(staff, draft.id, { status: 'sent' })
        await staffPayloadUpdate(staff, draft.id, { status: 'accepted' })
        const key = `race-dbl-key-${round}-${Date.now()}-${Math.random().toString(36).slice(2)}`

        const results = await Promise.allSettled(
          Array.from({ length: POOL_MAX }, (_, i) =>
            commerce.convertQuoteToOrder(String(pacificCompanyId), String(draft.id), {
              poNumber: `PO-DBL-${round}-${i}-${Date.now()}`,
              shipTo,
              idempotencyKey: key,
            }),
          ),
        )

        const ok = results.filter((r) => r.status === 'fulfilled')
        expect(ok.length).toBe(POOL_MAX)
        const orderIds = new Set(
          ok.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id),
        )
        expect(orderIds.size).toBe(1)

        const fresh = await payload.findByID({ collection: 'quotes', id: draft.id, overrideAccess: true })
        await deleteQuoteAndOrder(payload, draft.id, fresh.convertedOrder)
      }
    },
    360_000,
  )

  it(
    'staff send racing staff line edit yields one winner without 500 or deadlock',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      for (let round = 0; round < RACE_ROUNDS; round++) {
        const draft = await createDraftQuote(`race-send-${round}`)
        const staffUser = await payload.findByID({
          collection: 'users',
          id: staffUserId,
          overrideAccess: true,
        })
        const reqs = Array.from({ length: POOL_MAX }, () => createPayloadReq(payload, staffUser))

        const results = await Promise.allSettled([
          staffQuoteUpdate(payload, reqs[0]!, draft.id, { status: 'sent' }),
          staffQuoteUpdate(payload, reqs[1]!, draft.id, {
            lines: [{ sku: '7353101.002', variant: variantId, quantity: 2, unitPrice: 10 }],
          }),
          ...reqs.slice(2).map((r) => staffQuoteUpdate(payload, r, draft.id, { status: 'sent' })),
        ])

        expectQuoteRaceResults(results, POOL_MAX)
        const fresh = await payload.findByID({ collection: 'quotes', id: draft.id, overrideAccess: true })
        if (fresh.status === 'sent') {
          expect(fresh.lines?.[0]?.quantity).toBe(1)
        } else {
          expect(fresh.status).toBe('draft')
          expect(fresh.lines?.[0]?.quantity).toBe(2)
        }
        await deleteTestQuote(draft.id)
      }
    },
    360_000,
  )
})
