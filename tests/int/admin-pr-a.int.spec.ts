// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from 'graphql'
import { getPayload, type Payload, type PayloadRequest } from 'payload'

import config from '@/payload.config'
import { createPostgresCommerceService } from '@/commerce/postgres'
import { createPayloadReq } from '@/lib/payload-req'
import { staffOrderUpdate } from '@/lib/orders/staff-order-update'
import { withPayloadTransaction } from '@/lib/orders/payload-transaction'
import {
  assertValidStatusTransition,
  OrderTransitionConflictError,
  OrderWorkflowError,
  setOrderClientStatus,
  type OrderStatus,
} from '@/lib/orders/order-workflow'
import { approveVendorBuyer, rejectVendorBuyer } from '@/lib/admin/vendor-approval-actions'

const POOL_MAX = Number(process.env.DB_POOL_MAX ?? 5)
const RACE_ROUNDS = 60

const shipTo = {
  name: 'Test',
  line1: '1 Main',
  city: 'SF',
  state: 'CA',
  postalCode: '94105',
  country: 'US',
}

const VALID_TRANSITIONS: Array<[OrderStatus, OrderStatus]> = [
  ['draft', 'submitted'],
  ['submitted', 'confirmed'],
  ['submitted', 'cancelled'],
  ['confirmed', 'shipped'],
  ['confirmed', 'cancelled'],
  ['shipped', 'delivered'],
]

function apiStatus(err: unknown): number | undefined {
  return (err as { status?: number }).status
}

describe('admin PR A — approval and order workflow', () => {
  let payload: Payload
  let graphQLSchema: import('graphql').GraphQLSchema | undefined
  let pacificCompanyId: number
  let pacificUserId: number
  let staffUserId: number

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
    graphQLSchema = payload.schema
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
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  async function staffReq() {
    const staff = await payload.findByID({ collection: 'users', id: staffUserId, overrideAccess: true })
    return createPayloadReq(payload, staff)
  }

  async function staffPayloadUpdate(
    req: PayloadRequest,
    orderId: number,
    data: Record<string, unknown>,
  ) {
    return payload.update({
      collection: 'orders',
      id: orderId,
      data,
      req,
      overrideAccess: false,
    })
  }

  async function vendorReq(userId: number) {
    const user = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true })
    return createPayloadReq(payload, user)
  }

  async function deleteTestOrder(orderId: number) {
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

  async function createSubmittedOrder(companyId: number, label: string) {
    const created = await payload.create({
      collection: 'orders',
      data: {
        company: companyId,
        status: 'submitted',
        orderNumber: `ADM-${label}-${Date.now()}`,
        poNumber: `PO-${label}-${Date.now()}`,
        shipTo,
        lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
      },
      overrideAccess: true,
    })
    return created
  }

  async function createDraftOrder(companyId: number, label: string) {
    return payload.create({
      collection: 'orders',
      data: {
        company: companyId,
        status: 'draft',
        poNumber: `PO-DRAFT-${label}-${Date.now()}`,
        shipTo,
        lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
      },
      overrideAccess: true,
    })
  }

  it('allows only the configured status transition matrix', () => {
    for (const [from, to] of VALID_TRANSITIONS) {
      expect(() => assertValidStatusTransition(from, to)).not.toThrow()
    }
    expect(() => assertValidStatusTransition('submitted', 'shipped')).toThrow(OrderTransitionConflictError)
    expect(() => assertValidStatusTransition('delivered', 'cancelled')).toThrow(OrderTransitionConflictError)
    expect(() => assertValidStatusTransition('cancelled', 'confirmed')).toThrow(OrderTransitionConflictError)
  })

  it('rejects invalid order status transitions with 409', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'invalid-tx')
    await expect(staffOrderUpdate(payload, req, order.id, { status: 'shipped' })).rejects.toMatchObject({
      status: 409,
    })
    await deleteTestOrder(order.id)
  })

  it('allows status updates when ship-to and lines differ only by serialization', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await payload.create({
      collection: 'orders',
      data: {
        company: pacificCompanyId,
        status: 'submitted',
        orderNumber: `ADM-ser-${Date.now()}`,
        poNumber: `PO-ser-${Date.now()}`,
        shipTo: { ...shipTo, line2: null },
        lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
      },
      overrideAccess: true,
    })

    const reorderedShipTo = {
      country: 'US',
      postalCode: '94105',
      state: 'CA',
      city: 'SF',
      line1: '1 Main',
      line2: '',
      name: 'Test',
    }

    await staffPayloadUpdate(req, order.id, {
      status: 'confirmed',
      shipTo: reorderedShipTo,
      lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
    })
    const confirmed = await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })
    expect(confirmed.status).toBe('confirmed')

    await staffPayloadUpdate(req, order.id, {
      status: 'shipped',
      carrier: 'UPS',
      trackingNumber: '1Z999',
      shipTo: { name: 'Test', line1: '1 Main', city: 'SF', state: 'CA', postalCode: '94105', country: 'US' },
      lines: [{ quantity: 1, unitPrice: 10, sku: '7353101.002' }],
    })
    const shipped = await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })
    expect(shipped.status).toBe('shipped')
    expect(shipped.carrier).toBe('UPS')
    await deleteTestOrder(order.id)
  })

  it('returns 400 for shipTo null on frozen orders', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'shipto-null')
    await expect(staffPayloadUpdate(req, order.id, { shipTo: null })).rejects.toMatchObject({
      status: 400,
    })
    await deleteTestOrder(order.id)
  })

  it('returns 409 not frozen-field 400 when client status is stale after submit', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const vendor = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    const commerce = createPostgresCommerceService(payload, vendor)
    const draft = await createDraftOrder(pacificCompanyId, 'stale-status')
    const staff = await staffReq()
    setOrderClientStatus(staff, 'draft')
    await commerce.submitOrder(String(draft.id), `stale-${Date.now()}`, String(pacificCompanyId))
    await expect(
      withPayloadTransaction(payload, staff, () =>
        payload.update({
          collection: 'orders',
          id: draft.id,
          data: {
            status: 'confirmed',
            orderNumber: '',
            poNumber: draft.poNumber,
            shipTo,
            lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
          },
          req: staff,
          overrideAccess: true,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 })
    await deleteTestOrder(draft.id)
  })

  it('returns 400 for frozen field changes with overrideAccess: false (not silent drop)', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'frozen-access')
    const originalPo = order.poNumber

    await expect(
      staffPayloadUpdate(req, order.id, { poNumber: `${originalPo}-CHANGED` }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(staffPayloadUpdate(req, order.id, { poNumber: '' })).rejects.toMatchObject({
      status: 400,
    })
    await expect(staffPayloadUpdate(req, order.id, { poNumber: null })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      staffPayloadUpdate(req, order.id, { shipTo: { ...shipTo, line1: '999 Hack St' } }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(staffPayloadUpdate(req, order.id, { shipTo: null })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      staffPayloadUpdate(req, order.id, {
        lines: [{ sku: '7353101.002', quantity: 2, unitPrice: 10 }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(staffPayloadUpdate(req, order.id, { lines: [] })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      staffPayloadUpdate(req, order.id, { orderNumber: 'HACK-ORD' }),
    ).rejects.toMatchObject({ status: 400 })

    const otherCo = await payload.create({
      collection: 'companies',
      data: { name: `PR-A frozen co ${Date.now()}`, accountApproved: true },
      overrideAccess: true,
    })
    await expect(
      staffPayloadUpdate(req, order.id, { company: otherCo.id }),
    ).rejects.toMatchObject({ status: 400 })

    const unchanged = await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })
    expect(unchanged.poNumber).toBe(originalPo)
    await payload.delete({ collection: 'companies', id: otherCo.id, overrideAccess: true })
    await deleteTestOrder(order.id)
  })

  it('allows equivalent frozen-field resend with overrideAccess: false', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await payload.create({
      collection: 'orders',
      data: {
        company: pacificCompanyId,
        status: 'submitted',
        orderNumber: `ADM-resend-${Date.now()}`,
        poNumber: `PO-resend-${Date.now()}`,
        shipTo: { ...shipTo, line2: null },
        lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
      },
      overrideAccess: true,
    })
    await expect(
      staffPayloadUpdate(req, order.id, {
        status: 'confirmed',
        shipTo: { country: 'US', postalCode: '94105', state: 'CA', city: 'SF', line1: '1 Main', line2: '', name: 'Test' },
        lines: [{ unitPrice: 10, quantity: 1, sku: '7353101.002' }],
      }),
    ).resolves.toBeTruthy()
    await deleteTestOrder(order.id)
  })

  it('applies PO edits when draft becomes submitted in one save', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const draft = await createDraftOrder(pacificCompanyId, 'draft-po')
    const newPo = `PO-SUBMIT-${Date.now()}`
    await staffPayloadUpdate(req, draft.id, {
      status: 'submitted',
      poNumber: newPo,
    })
    const fresh = await payload.findByID({ collection: 'orders', id: draft.id, overrideAccess: true })
    expect(fresh.status).toBe('submitted')
    expect(fresh.poNumber).toBe(newPo)
    expect(String(fresh.orderNumber ?? '')).toMatch(/^ORD-\d{4}-\d{6}$/)
    await deleteTestOrder(draft.id)
  })

  it('generates orderNumber when admin submits draft without one', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const draft = await createDraftOrder(pacificCompanyId, 'gen-ord')
    await staffPayloadUpdate(req, draft.id, { status: 'submitted', orderNumber: '' })
    const fresh = await payload.findByID({ collection: 'orders', id: draft.id, overrideAccess: true })
    expect(fresh.status).toBe('submitted')
    expect(String(fresh.orderNumber ?? '')).toMatch(/^ORD-\d{4}-\d{6}$/)
    await deleteTestOrder(draft.id)
  })

  it('blocks frozen fields with 400', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'frozen')
    await expect(
      staffPayloadUpdate(req, order.id, { shipTo: { ...shipTo, line1: '999 Hack St' } }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      staffPayloadUpdate(req, order.id, {
        lines: [{ sku: '7353101.002', quantity: 2, unitPrice: 10 }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(staffPayloadUpdate(req, order.id, { poNumber: '' })).rejects.toMatchObject({
      status: 400,
    })
    await expect(staffPayloadUpdate(req, order.id, { poNumber: null })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      staffPayloadUpdate(req, order.id, { orderNumber: 'HACK-ORD' }),
    ).rejects.toMatchObject({ status: 400 })
    await deleteTestOrder(order.id)
  })

  it('blocks deleting orders that have history', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'no-del')
    await staffOrderUpdate(payload, req, order.id, { status: 'confirmed' })
    await expect(
      withPayloadTransaction(payload, req, () =>
        payload.delete({ collection: 'orders', id: order.id, req }),
      ),
    ).rejects.toMatchObject({ status: 409 })
    await deleteTestOrder(order.id)
  })

  it('records order-events on staff status change', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'events')
    await staffOrderUpdate(payload, req, order.id, { status: 'confirmed' })
    const events = await payload.find({
      collection: 'order-events',
      where: { order: { equals: order.id } },
      limit: 10,
      overrideAccess: true,
    })
    expect(events.docs.some((e) => e.fromStatus === 'submitted' && e.toStatus === 'confirmed')).toBe(true)
    await deleteTestOrder(order.id)
  })

  it('denies vendor REST updates to order status and tracking', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await vendorReq(pacificUserId)
    const order = await createSubmittedOrder(pacificCompanyId, 'vendor-rest')
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: { status: 'confirmed', trackingNumber: 'HACK' },
        req,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/not allowed|Forbidden/i)
    await deleteTestOrder(order.id)
  })

  it('isolates order-events reads between vendors', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const staff = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'iso-ev')
    await staffOrderUpdate(payload, staff, order.id, { status: 'confirmed' })
    const pacificReq = await vendorReq(pacificUserId)
    const own = await payload.find({
      collection: 'order-events',
      where: { order: { equals: order.id } },
      limit: 5,
      req: pacificReq,
      overrideAccess: false,
    })
    expect(own.docs.length).toBeGreaterThan(0)

    const otherCo = await payload.create({
      collection: 'companies',
      data: { name: `PR-A iso ${Date.now()}`, accountApproved: true },
      overrideAccess: true,
    })
    const otherUser = await payload.create({
      collection: 'users',
      data: {
        email: `pr-a-iso-${Date.now()}@local.test`,
        password: 'local-dev-vendor-password',
        role: 'vendor-buyer',
        approved: true,
        approvalStatus: 'approved',
        company: otherCo.id,
      },
      overrideAccess: true,
    })
    const otherReq = createPayloadReq(payload, otherUser)
    const cross = await payload.find({
      collection: 'order-events',
      where: { order: { equals: order.id } },
      limit: 5,
      req: otherReq,
      overrideAccess: false,
    })
    expect(cross.docs).toHaveLength(0)
    await payload.delete({ collection: 'users', id: otherUser.id, overrideAccess: true })
    await payload.delete({ collection: 'companies', id: otherCo.id, overrideAccess: true })
    await deleteTestOrder(order.id)
  })

  it(
    'concurrent confirm vs cancel yields one winner and correct events',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      for (let round = 0; round < RACE_ROUNDS; round++) {
        const order = await createSubmittedOrder(pacificCompanyId, `cnc-${round}`)
        const staffUser = await payload.findByID({
          collection: 'users',
          id: staffUserId,
          overrideAccess: true,
        })
        const reqs = Array.from({ length: POOL_MAX }, () => createPayloadReq(payload, staffUser))
        const results = await Promise.allSettled([
          staffOrderUpdate(payload, reqs[0]!, order.id, { status: 'confirmed' }),
          staffOrderUpdate(payload, reqs[1]!, order.id, { status: 'cancelled' }),
          ...reqs.slice(2).map((r) => staffOrderUpdate(payload, r, order.id, { status: 'confirmed' })),
        ])
        const ok = results.filter((r) => r.status === 'fulfilled')
        const fail409 = results.filter(
          (r) => r.status === 'rejected' && apiStatus((r as PromiseRejectedResult).reason) === 409,
        )
        expect(ok.length).toBe(1)
        expect(fail409.length).toBe(POOL_MAX - 1)
        expect(results.every((r) => r.status === 'rejected' ? apiStatus((r as PromiseRejectedResult).reason) !== 500 : true)).toBe(true)

        const fresh = await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })
        expect(['confirmed', 'cancelled']).toContain(String(fresh.status))

        const events = await payload.find({
          collection: 'order-events',
          where: { order: { equals: order.id } },
          sort: 'createdAt',
          limit: 20,
          overrideAccess: true,
        })
        expect(events.docs).toHaveLength(1)
        expect(events.docs[0]!.fromStatus).toBe('submitted')
        expect(events.docs[0]!.toStatus).toBe(String(fresh.status))
        await deleteTestOrder(order.id)
      }
    },
    360_000,
  )

  it(
    'concurrent ship vs cancel after confirm yields one terminal status',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      for (let round = 0; round < RACE_ROUNDS; round++) {
        const order = await createSubmittedOrder(pacificCompanyId, `scc-${round}`)
        const staff = await staffReq()
        await staffOrderUpdate(payload, staff, order.id, { status: 'confirmed' })
        const staffUser = await payload.findByID({
          collection: 'users',
          id: staffUserId,
          overrideAccess: true,
        })
        const reqs = Array.from({ length: POOL_MAX }, () => createPayloadReq(payload, staffUser))
        const results = await Promise.allSettled([
          staffOrderUpdate(payload, reqs[0]!, order.id, { status: 'shipped', carrier: 'UPS' }),
          staffOrderUpdate(payload, reqs[1]!, order.id, { status: 'cancelled' }),
          ...reqs.slice(2).map((r) => staffOrderUpdate(payload, r, order.id, { status: 'shipped' })),
        ])
        const ok = results.filter((r) => r.status === 'fulfilled')
        expect(ok.length).toBe(1)
        const fresh = await payload.findByID({ collection: 'orders', id: order.id, overrideAccess: true })
        expect(['shipped', 'cancelled']).toContain(String(fresh.status))
        const events = await payload.find({
          collection: 'order-events',
          where: { order: { equals: order.id } },
          sort: 'createdAt',
          limit: 20,
          overrideAccess: true,
        })
        expect(events.docs).toHaveLength(2)
        expect(events.docs[0]!.toStatus).toBe('confirmed')
        expect(events.docs[1]!.fromStatus).toBe('confirmed')
        expect(events.docs[1]!.toStatus).toBe(String(fresh.status))
        await deleteTestOrder(order.id)
      }
    },
    360_000,
  )

  it(
    'double submit plus staff confirm does not duplicate submitted events',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const vendor = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
      const commerce = createPostgresCommerceService(payload, vendor)
      const companyId = String(pacificCompanyId)

      for (let round = 0; round < 30; round++) {
        const draft = await createDraftOrder(pacificCompanyId, `dbl-${round}`)
        const key = `dbl-key-${round}-${Date.now()}`
        const submits = await Promise.allSettled([
          commerce.submitOrder(String(draft.id), key, companyId),
          commerce.submitOrder(String(draft.id), key, companyId),
        ])
        expect(submits.every((r) => r.status === 'fulfilled')).toBe(true)

        const staffUser = await payload.findByID({
          collection: 'users',
          id: staffUserId,
          overrideAccess: true,
        })
        const staffReqs = Array.from({ length: POOL_MAX }, () => createPayloadReq(payload, staffUser))
        const confirms = await Promise.allSettled(
          staffReqs.map((r) => staffOrderUpdate(payload, r, draft.id, { status: 'confirmed' })),
        )
        const confirmOk = confirms.filter((r) => r.status === 'fulfilled')
        expect(confirmOk.length).toBe(1)

        const events = await payload.find({
          collection: 'order-events',
          where: { order: { equals: draft.id } },
          sort: 'createdAt',
          limit: 20,
          overrideAccess: true,
        })
        const submittedEvents = events.docs.filter((e) => e.toStatus === 'submitted')
        expect(submittedEvents).toHaveLength(1)
        expect(confirms.every((r) => r.status === 'rejected' ? apiStatus((r as PromiseRejectedResult).reason) !== 500 : true)).toBe(true)
        await deleteTestOrder(draft.id)
      }
    },
    360_000,
  )

  it('approval reject blocks vendor reads after reload from DB', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const email = `pr-a-pending-${Date.now()}@local.test`
    const company = await payload.create({
      collection: 'companies',
      data: { name: `PR-A Co ${Date.now()}`, accountApproved: true },
      overrideAccess: true,
    })
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'local-dev-vendor-password',
        role: 'vendor-buyer',
        approved: true,
        approvalStatus: 'approved',
        company: company.id,
      },
      overrideAccess: true,
    })
    const staff = await staffReq()
    await rejectVendorBuyer(staff, user.id)
    const fresh = await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })
    const req = createPayloadReq(payload, fresh)
    await expect(
      payload.find({
        collection: 'orders',
        where: { company: { equals: company.id } },
        limit: 1,
        req,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/not allowed|Forbidden/i)
    await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
    await payload.delete({ collection: 'companies', id: company.id, overrideAccess: true })
  })

  it('staff approve endpoint sets audit fields', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const email = `pr-a-approve-${Date.now()}@local.test`
    const company = await payload.create({
      collection: 'companies',
      data: { name: `PR-A Approve ${Date.now()}`, accountApproved: true },
      overrideAccess: true,
    })
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'local-dev-vendor-password',
        role: 'vendor-buyer',
        approved: false,
        approvalStatus: 'pending',
        company: company.id,
      },
      overrideAccess: true,
    })
    const staff = await staffReq()
    await approveVendorBuyer(staff, user.id)
    const fresh = await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })
    expect(fresh.approvalStatus).toBe('approved')
    expect(fresh.approvalReviewedBy).toBeTruthy()
    expect(fresh.approvalReviewedAt).toBeTruthy()
    await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
    await payload.delete({ collection: 'companies', id: company.id, overrideAccess: true })
  })

  function anonymousReq() {
    return createPayloadReq(payload, null)
  }

  it('does not leak orders via frozen-field oracle to anonymous callers', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const order = await createSubmittedOrder(pacificCompanyId, 'oracle-anon')
    const anon = anonymousReq()
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: { poNumber: 'WRONG-PO-GUESS' },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: { poNumber: order.poNumber },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'orders',
        id: 999_999_999,
        data: { poNumber: 'X' },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'orders',
        where: { poNumber: { equals: order.poNumber } },
        data: { poNumber: 'HACK-PO' },
        req: anon,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await deleteTestOrder(order.id)
  })

  it('does not leak orders via frozen-field oracle to vendor callers', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const order = await createSubmittedOrder(pacificCompanyId, 'oracle-vendor')
    const vendor = await vendorReq(pacificUserId)
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: { poNumber: 'WRONG-PO-GUESS' },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: { poNumber: order.poNumber },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'orders',
        id: 999_999_999,
        data: { poNumber: 'X' },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({
        collection: 'orders',
        where: { 'shipTo.city': { equals: shipTo.city } },
        data: { poNumber: 'HACK-PO' },
        req: vendor,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await deleteTestOrder(order.id)
  })

  it('rejects staff draft PO edits that race vendor submit (TOCTOU re-check)', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const vendor = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    const commerce = createPostgresCommerceService(payload, vendor)
    const draft = await createDraftOrder(pacificCompanyId, 'toctou-po')
    const staff = await staffReq()
    const originalPo = draft.poNumber
    await commerce.submitOrder(String(draft.id), `toctou-${Date.now()}`, String(pacificCompanyId))
    await expect(
      staffPayloadUpdate(staff, draft.id, { poNumber: `PO-RACE-${Date.now()}` }),
    ).rejects.toMatchObject({ status: 400 })
    const fresh = await payload.findByID({ collection: 'orders', id: draft.id, overrideAccess: true })
    expect(fresh.poNumber).toBe(originalPo)
    await deleteTestOrder(draft.id)
  })

  it('approve/reject on non-buyer returns 400', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const staff = await staffReq()
    await expect(approveVendorBuyer(staff, staffUserId)).rejects.toMatchObject({ status: 400 })
  })

  it('denies vendor GraphQL writes to order-events', async () => {
    if (!process.env.DATABASE_URL || !payload || !graphQLSchema) return
    const pacificUser = await payload.findByID({
      collection: 'users',
      id: pacificUserId,
      overrideAccess: true,
    })
    const mutation = `
      mutation {
        createOrderEvent(data: {
          order: 1,
          company: ${pacificCompanyId},
          kind: status_change,
          fromStatus: "a",
          toStatus: "b"
        }) { id }
      }`
    const result = await graphql({
      schema: graphQLSchema,
      source: mutation,
      contextValue: { req: { user: pacificUser, payload } },
    })
    expect(result.errors?.length).toBeGreaterThan(0)
  })
})
