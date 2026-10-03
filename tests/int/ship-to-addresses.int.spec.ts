// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from 'graphql'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { shipToFromCompanyDefault, type ShipToFields } from '@/lib/checkout/ship-to'
import { createPayloadReq } from '@/lib/payload-req'
import {
  createVendorShipToAddress,
  deleteVendorShipToAddress,
  listVendorShipToAddresses,
  restoreCompanyDefaultShipToState,
  setVendorDefaultShipToAddress,
  ShipToAddressValidationError,
  updateVendorShipToAddress,
} from '@/lib/vendor/ship-to-addresses'

const POOL_MAX = Number(process.env.DB_POOL_MAX ?? 5)
const RACE_ROUNDS = 30

type AddressRow = {
  id: number
  label: string
  name: string
  line1: string
  line2?: string | null
  city: string
  state: string
  postalCode: string
  country: string
  isDefault: boolean
}

type PacificSnapshot = {
  defaultAddressId: string | null
  defaultShipTo: ShipToFields | null
  addresses: AddressRow[]
}

describe('vendor ship-to addresses', () => {
  let payload: Payload
  let graphQLSchema: import('graphql').GraphQLSchema | null = null
  let pacificCompanyId: string
  let bayCompanyId: string
  let pacificUserId: number
  let bayUserId: number
  let pacificSnapshot: PacificSnapshot | null = null

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
    graphQLSchema = payload.schema ?? null
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
    pacificSnapshot = await capturePacificSnapshot()
  })

  afterEach(async () => {
    if (!process.env.DATABASE_URL || !payload || !pacificSnapshot) return
    await restorePacificSnapshot(pacificSnapshot)
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  async function userById(id: number) {
    return payload.findByID({ collection: 'users', id, overrideAccess: true })
  }

  async function capturePacificSnapshot(): Promise<PacificSnapshot> {
    const company = await payload.findByID({
      collection: 'companies',
      id: Number(pacificCompanyId),
      overrideAccess: true,
    })
    const rows = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: Number(pacificCompanyId) } },
      limit: 200,
      overrideAccess: true,
    })
    const defaultRow = rows.docs.find((d) => d.isDefault)
    return {
      defaultAddressId: defaultRow ? String(defaultRow.id) : null,
      defaultShipTo: shipToFromCompanyDefault(company.defaultShipTo),
      addresses: rows.docs.map((d) => ({
        id: d.id,
        label: String(d.label),
        name: String(d.name),
        line1: String(d.line1),
        line2: d.line2 ? String(d.line2) : null,
        city: String(d.city),
        state: String(d.state),
        postalCode: String(d.postalCode),
        country: String(d.country ?? 'US'),
        isDefault: Boolean(d.isDefault),
      })),
    }
  }

  async function restorePacificSnapshot(snapshot: PacificSnapshot) {
    const current = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: Number(pacificCompanyId) } },
      limit: 500,
      overrideAccess: true,
    })
    for (const row of current.docs) {
      await payload.delete({ collection: 'ship-to-addresses', id: row.id, overrideAccess: true })
    }

    let defaultNewId: string | null = null
    for (const snap of snapshot.addresses) {
      const created = await payload.create({
        collection: 'ship-to-addresses',
        data: {
          company: Number(pacificCompanyId),
          label: snap.label,
          name: snap.name,
          line1: snap.line1,
          line2: snap.line2,
          city: snap.city,
          state: snap.state,
          postalCode: snap.postalCode,
          country: snap.country,
          isDefault: false,
        },
        overrideAccess: true,
      })
      if (snapshot.defaultAddressId && String(snap.id) === snapshot.defaultAddressId) {
        defaultNewId = String(created.id)
      }
    }

    await restoreCompanyDefaultShipToState(
      payload,
      Number(pacificCompanyId),
      defaultNewId,
      snapshot.defaultShipTo,
    )
  }

  const sampleAddress = (label: string) => ({
    label,
    name: `${label} Receiving`,
    line1: '500 Test Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94107',
    country: 'US',
  })

  async function expectAccessDenied(promise: Promise<unknown>) {
    await expect(promise).rejects.toThrow(/Forbidden|Access|not allowed|Unauthorized/i)
  }

  it('blocks unapproved Bay buyer from reading and creating addresses', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const bayUser = await userById(bayUserId)
    await expect(
      listVendorShipToAddresses(payload, bayUser, bayCompanyId),
    ).rejects.toBeInstanceOf(ShipToAddressValidationError)
    await expect(
      createVendorShipToAddress(
        payload,
        bayUser,
        bayCompanyId,
        sampleAddress(`blocked-${Date.now()}`),
      ),
    ).rejects.toBeInstanceOf(ShipToAddressValidationError)

    await expect(
      payload.find({
        collection: 'ship-to-addresses',
        where: { company: { equals: Number(bayCompanyId) } },
        limit: 10,
        req: createPayloadReq(payload, bayUser),
        overrideAccess: false,
      }),
    ).rejects.toThrow(/not allowed to perform this action/i)
  })

  it('prevents cross-vendor read and mutation by id or list', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const pacificUser = await userById(pacificUserId)
    const bayUser = await userById(bayUserId)
    const stamp = Date.now()
    const created = await createVendorShipToAddress(
      payload,
      pacificUser,
      pacificCompanyId,
      sampleAddress(`iso-${stamp}`),
    )

    await expect(
      listVendorShipToAddresses(payload, bayUser, pacificCompanyId),
    ).rejects.toBeInstanceOf(ShipToAddressValidationError)

    await expect(
      updateVendorShipToAddress(payload, bayUser, bayCompanyId, created.id, sampleAddress('hack')),
    ).rejects.toBeInstanceOf(ShipToAddressValidationError)

    const pacificList = await listVendorShipToAddresses(payload, pacificUser, pacificCompanyId)
    expect(pacificList.some((a) => a.id === created.id)).toBe(true)

    await deleteVendorShipToAddress(payload, pacificUser, pacificCompanyId, created.id)
  })

  it('denies vendor REST and GraphQL writes on ship-to addresses', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const pacificUser = await userById(pacificUserId)
    const req = createPayloadReq(payload, pacificUser)
    const own = await createVendorShipToAddress(
      payload,
      pacificUser,
      pacificCompanyId,
      sampleAddress(`rest-${Date.now()}`),
    )

    await expectAccessDenied(
      payload.create({
        collection: 'ship-to-addresses',
        data: {
          company: Number(bayCompanyId),
          label: 'hack',
          name: 'n',
          line1: 'l',
          city: 'c',
          state: 'CA',
          postalCode: '94101',
          country: 'US',
          isDefault: true,
        },
        req,
        overrideAccess: false,
      }),
    )

    await expectAccessDenied(
      payload.update({
        collection: 'ship-to-addresses',
        id: own.id,
        data: { company: Number(bayCompanyId) },
        req,
        overrideAccess: false,
      }),
    )

    await expectAccessDenied(
      payload.update({
        collection: 'ship-to-addresses',
        id: own.id,
        data: { isDefault: true },
        req,
        overrideAccess: false,
      }),
    )

    await expectAccessDenied(
      payload.delete({
        collection: 'ship-to-addresses',
        id: own.id,
        req,
        overrideAccess: false,
      }),
    )

    if (graphQLSchema) {
      const mutation = `
        mutation CreateShipTo($company: Int!, $label: String!) {
          createShipToAddress(data: {
            company: $company,
            label: $label,
            name: "n",
            line1: "l",
            city: "c",
            state: "CA",
            postalCode: "94101",
            country: "US",
            isDefault: true
          }) { id }
        }`
      const result = await graphql({
        schema: graphQLSchema,
        source: mutation,
        variableValues: { company: Number(bayCompanyId), label: 'gql-hack' },
        contextValue: { req: { user: pacificUser, payload } },
      })
      expect(result.errors?.length).toBeGreaterThan(0)
    }

    await deleteVendorShipToAddress(payload, pacificUser, pacificCompanyId, own.id)
  })

  it(
    'concurrent set-default leaves exactly one default address',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const pacificUser = await userById(pacificUserId)
      const stamp = Date.now()
      const a = await createVendorShipToAddress(
        payload,
        pacificUser,
        pacificCompanyId,
        sampleAddress(`def-a-${stamp}`),
      )
      const b = await createVendorShipToAddress(
        payload,
        pacificUser,
        pacificCompanyId,
        sampleAddress(`def-b-${stamp}`),
      )
      const c = await createVendorShipToAddress(
        payload,
        pacificUser,
        pacificCompanyId,
        sampleAddress(`def-c-${stamp}`),
      )

      const targets = [a.id, b.id, c.id]
      await Promise.all(
        Array.from({ length: POOL_MAX }, (_, i) =>
          setVendorDefaultShipToAddress(payload, pacificUser, pacificCompanyId, targets[i % targets.length]!),
        ),
      )

      const rows = await payload.find({
        collection: 'ship-to-addresses',
        where: {
          and: [
            { company: { equals: Number(pacificCompanyId) } },
            { label: { like: `def-` } },
          ],
        },
        limit: 20,
        overrideAccess: true,
      })
      const ours = rows.docs.filter((d) => String(d.label ?? '').includes(String(stamp)))
      const defaults = ours.filter((d) => d.isDefault)
      expect(defaults).toHaveLength(1)

      for (const row of ours) {
        await payload.delete({ collection: 'ship-to-addresses', id: row.id, overrideAccess: true })
      }
    },
    120_000,
  )

  it(
    'concurrent first creates on an empty book leave one default',
    async () => {
      if (!process.env.DATABASE_URL || !payload || !pacificSnapshot) return
      const pacificUser = await userById(pacificUserId)
      const existing = await payload.find({
        collection: 'ship-to-addresses',
        where: { company: { equals: Number(pacificCompanyId) } },
        limit: 500,
        overrideAccess: true,
      })
      for (const row of existing.docs) {
        await payload.delete({ collection: 'ship-to-addresses', id: row.id, overrideAccess: true })
      }

      const stamp = Date.now()
      await Promise.all(
        Array.from({ length: POOL_MAX }, (_, i) =>
          createVendorShipToAddress(
            payload,
            pacificUser,
            pacificCompanyId,
            sampleAddress(`empty-${stamp}-${i}`),
          ),
        ),
      )

      const rows = await payload.find({
        collection: 'ship-to-addresses',
        where: {
          and: [
            { company: { equals: Number(pacificCompanyId) } },
            { label: { like: `empty-${stamp}` } },
          ],
        },
        limit: 20,
        overrideAccess: true,
      })
      expect(rows.docs.length).toBe(POOL_MAX)
      expect(rows.docs.filter((d) => d.isDefault)).toHaveLength(1)
    },
    120_000,
  )

  it(
    'delete-default racing set-default ends with one default',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      const pacificUser = await userById(pacificUserId)
      let doubleDefaultRounds = 0

      for (let round = 0; round < RACE_ROUNDS; round++) {
        const stamp = `${Date.now()}-${round}`
        const a = await createVendorShipToAddress(
          payload,
          pacificUser,
          pacificCompanyId,
          sampleAddress(`race-a-${stamp}`),
        )
        const b = await createVendorShipToAddress(
          payload,
          pacificUser,
          pacificCompanyId,
          sampleAddress(`race-b-${stamp}`),
        )
        await setVendorDefaultShipToAddress(payload, pacificUser, pacificCompanyId, a.id)

        await Promise.all([
          deleteVendorShipToAddress(payload, pacificUser, pacificCompanyId, a.id),
          setVendorDefaultShipToAddress(payload, pacificUser, pacificCompanyId, b.id),
        ])

        const rows = await payload.find({
          collection: 'ship-to-addresses',
          where: { company: { equals: Number(pacificCompanyId) } },
          limit: 50,
          overrideAccess: true,
        })
        const ours = rows.docs.filter((d) => String(d.label ?? '').includes(stamp))
        const defaults = ours.filter((d) => d.isDefault)
        if (defaults.length !== 1) doubleDefaultRounds++
        for (const row of ours) {
          await payload.delete({ collection: 'ship-to-addresses', id: row.id, overrideAccess: true })
        }
      }

      expect(doubleDefaultRounds).toBe(0)
    },
    180_000,
  )

  it('promotes another address when the default is deleted', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const pacificUser = await userById(pacificUserId)
    const stamp = Date.now()
    const first = await createVendorShipToAddress(
      payload,
      pacificUser,
      pacificCompanyId,
      sampleAddress(`del-a-${stamp}`),
    )
    const second = await createVendorShipToAddress(
      payload,
      pacificUser,
      pacificCompanyId,
      sampleAddress(`del-b-${stamp}`),
    )
    await setVendorDefaultShipToAddress(payload, pacificUser, pacificCompanyId, first.id)
    await deleteVendorShipToAddress(payload, pacificUser, pacificCompanyId, first.id)

    const remaining = await listVendorShipToAddresses(payload, pacificUser, pacificCompanyId)
    const secondRow = remaining.find((a) => a.id === second.id)
    expect(secondRow?.isDefault).toBe(true)

    await deleteVendorShipToAddress(payload, pacificUser, pacificCompanyId, second.id)
  })
})
