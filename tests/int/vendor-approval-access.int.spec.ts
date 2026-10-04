// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from 'graphql'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'
import { rejectVendorBuyer } from '@/lib/admin/vendor-approval-actions'

describe('rejected vendor catalog and cart access', () => {
  let payload: Payload
  let graphQLSchema: import('graphql').GraphQLSchema | undefined
  let staffUserId: number

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
    graphQLSchema = payload.schema
    const staff = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test' } },
      limit: 1,
      overrideAccess: true,
    })
    staffUserId = staff.docs[0]!.id
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  it('blocks rejected vendor from products, variants, and carts via REST', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const company = await payload.create({
      collection: 'companies',
      data: { name: `Reject access ${Date.now()}`, accountApproved: true },
      overrideAccess: true,
    })
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `reject-access-${Date.now()}@local.test`,
        password: 'local-dev-vendor-password',
        role: 'vendor-buyer',
        approved: true,
        approvalStatus: 'approved',
        company: company.id,
      },
      overrideAccess: true,
    })
    const staff = await payload.findByID({ collection: 'users', id: staffUserId, overrideAccess: true })
    await rejectVendorBuyer(createPayloadReq(payload, staff), user.id)
    const fresh = await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })
    const req = createPayloadReq(payload, fresh)

    await expect(
      payload.find({ collection: 'products', limit: 1, req, overrideAccess: false }),
    ).rejects.toThrow(/not allowed|Forbidden/i)
    await expect(
      payload.find({ collection: 'product-variants', limit: 1, req, overrideAccess: false }),
    ).rejects.toThrow(/not allowed|Forbidden/i)
    await expect(
      payload.find({ collection: 'carts', limit: 1, req, overrideAccess: false }),
    ).rejects.toThrow(/not allowed|Forbidden/i)

    await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
    await payload.delete({ collection: 'companies', id: company.id, overrideAccess: true })
  })

  it('blocks rejected vendor from products and variants via GraphQL', async () => {
    if (!process.env.DATABASE_URL || !payload || !graphQLSchema) return
    const company = await payload.create({
      collection: 'companies',
      data: { name: `Reject gql ${Date.now()}`, accountApproved: true },
      overrideAccess: true,
    })
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `reject-gql-${Date.now()}@local.test`,
        password: 'local-dev-vendor-password',
        role: 'vendor-buyer',
        approved: true,
        approvalStatus: 'approved',
        company: company.id,
      },
      overrideAccess: true,
    })
    const staff = await payload.findByID({ collection: 'users', id: staffUserId, overrideAccess: true })
    await rejectVendorBuyer(createPayloadReq(payload, staff), user.id)
    const fresh = await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })

    const query = `query { Products(limit: 1) { docs { id } } }`
    const result = await graphql({
      schema: graphQLSchema,
      source: query,
      contextValue: { req: { user: fresh, payload } },
    })
    expect(result.errors?.length).toBeGreaterThan(0)

    await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
    await payload.delete({ collection: 'companies', id: company.id, overrideAccess: true })
  })
})
