// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from 'graphql'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'
import {
  assertValidStatusTransition,
  OrderWorkflowError,
  type OrderStatus,
} from '@/lib/orders/order-workflow'
import { approveVendorBuyer, rejectVendorBuyer } from '@/lib/admin/vendor-approval-actions'

const POOL_MAX = Number(process.env.DB_POOL_MAX ?? 5)
const RACE_ROUNDS = 30

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

  async function vendorReq(userId: number) {
    const user = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true })
    return createPayloadReq(payload, user)
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

  it('allows only the configured status transition matrix', () => {
    for (const [from, to] of VALID_TRANSITIONS) {
      expect(() => assertValidStatusTransition(from, to)).not.toThrow()
    }
    expect(() => assertValidStatusTransition('submitted', 'shipped')).toThrow(OrderWorkflowError)
    expect(() => assertValidStatusTransition('delivered', 'cancelled')).toThrow(OrderWorkflowError)
    expect(() => assertValidStatusTransition('cancelled', 'confirmed')).toThrow(OrderWorkflowError)
  })

  it('rejects invalid order status transitions', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'invalid-tx')
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: { status: 'shipped' },
        req,
      }),
    ).rejects.toBeInstanceOf(OrderWorkflowError)
    await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
  })

  it('blocks frozen ship-to and line edits after submit', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'frozen')
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: { shipTo: { ...shipTo, line1: '999 Hack St' } },
        req,
      }),
    ).rejects.toBeInstanceOf(OrderWorkflowError)
    await expect(
      payload.update({
        collection: 'orders',
        id: order.id,
        data: {
          lines: [{ sku: '7353101.002', quantity: 2, unitPrice: 10 }],
        },
        req,
      }),
    ).rejects.toBeInstanceOf(OrderWorkflowError)
    await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
  })

  it('records order-events on staff status change', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const req = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'events')
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: { status: 'confirmed' },
      req,
    })
    const events = await payload.find({
      collection: 'order-events',
      where: { order: { equals: order.id } },
      limit: 10,
      overrideAccess: true,
    })
    expect(events.docs.some((e) => e.fromStatus === 'submitted' && e.toStatus === 'confirmed')).toBe(true)
    await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
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
    await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
  })

  it('isolates order-events reads between vendors', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const staff = await staffReq()
    const order = await createSubmittedOrder(pacificCompanyId, 'iso-ev')
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: { status: 'confirmed' },
      req: staff,
    })
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
    await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
  })

  it(
    'concurrent conflicting staff transitions end with one valid status',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      let badFinal = 0
      for (let round = 0; round < RACE_ROUNDS; round++) {
        const req = await staffReq()
        const order = await createSubmittedOrder(pacificCompanyId, `race-${round}`)
        await payload.update({
          collection: 'orders',
          id: order.id,
          data: { status: 'confirmed' },
          req,
        })
        const staff = await payload.findByID({ collection: 'users', id: staffUserId, overrideAccess: true })
        const reqs = Array.from({ length: POOL_MAX }, () => createPayloadReq(payload, staff))
        await Promise.allSettled([
          payload.update({
            collection: 'orders',
            id: order.id,
            data: { status: 'shipped', carrier: 'UPS' },
            req: reqs[0]!,
          }),
          payload.update({
            collection: 'orders',
            id: order.id,
            data: { status: 'cancelled' },
            req: reqs[1]!,
          }),
          ...reqs.slice(2).map((r) =>
            payload.update({
              collection: 'orders',
              id: order.id,
              data: { status: 'shipped' },
              req: r,
            }),
          ),
        ])
        const fresh = await payload.findByID({
          collection: 'orders',
          id: order.id,
          overrideAccess: true,
        })
        const okStatuses = ['shipped', 'cancelled']
        if (!okStatuses.includes(String(fresh.status))) badFinal++
        await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
      }
      expect(badFinal).toBe(0)
    },
    240_000,
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
    expect(fresh.approvalStatus).toBe('rejected')
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
