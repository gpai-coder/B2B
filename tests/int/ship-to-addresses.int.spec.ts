// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from 'graphql'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { shipToFromCompanyDefault, type ShipToFields } from '@/lib/checkout/ship-to'
import { parseCheckoutShipToFromForm } from '@/lib/checkout/parse-checkout-ship-to'
import { createPayloadReq } from '@/lib/payload-req'
import { sql } from '@payloadcms/db-postgres'
import {
  createVendorShipToAddress,
  deleteVendorShipToAddress,
  listVendorShipToAddresses,
  loadDefaultShipToForCheckout,
  restoreCompanyDefaultShipToState,
  setVendorDefaultShipToAddress,
  SHIP_TO_DEFAULT_INDEX_NAME,
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

  async function staffUser() {
    const admin = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test' } },
      limit: 1,
      overrideAccess: true,
    })
    return admin.docs[0]!
  }

  async function staffReq() {
    return createPayloadReq(payload, await staffUser())
  }

  function addressPayload(companyId: number, label: string, isDefault = false) {
    return {
      company: companyId,
      label,
      name: `${label} Receiving`,
      line1: '500 Test Street',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94107',
      country: 'US',
      isDefault,
    }
  }

  async function createTempCompany(namePrefix: string) {
    return payload.create({
      collection: 'companies',
      data: {
        name: `${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        accountApproved: true,
      },
      overrideAccess: true,
    })
  }

  async function deleteTempCompany(companyId: number) {
    const rows = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: companyId } },
      limit: 500,
      overrideAccess: true,
    })
    for (const row of rows.docs) {
      await payload.delete({ collection: 'ship-to-addresses', id: row.id, overrideAccess: true })
    }
    await payload.delete({ collection: 'companies', id: companyId, overrideAccess: true })
  }

  async function expectAccessDenied(promise: Promise<unknown>) {
    await expect(promise).rejects.toThrow(/Forbidden|Access|not allowed|Unauthorized/i)
  }

  it('defines partial unique index ship_to_addresses_one_default_per_company in pg_indexes', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const result = await payload.db.execute({
      drizzle: payload.db.drizzle,
      sql: sql`
        SELECT indexname FROM pg_indexes
        WHERE indexname = ${SHIP_TO_DEFAULT_INDEX_NAME}
        LIMIT 1
      `,
    })
    const rows = result.rows as Array<{ indexname: string }>
    expect(rows.some((r) => r.indexname === SHIP_TO_DEFAULT_INDEX_NAME)).toBe(true)
  })

  it('rejects a second isDefault insert via raw SQL (partial unique index)', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    let companyId: number | null = null
    try {
      const company = await createTempCompany('shipto-idx')
      companyId = company.id
      await payload.create({
        collection: 'ship-to-addresses',
        data: addressPayload(companyId, 'Index-A', true),
        overrideAccess: true,
      })

      await expect(
        payload.db.execute({
          drizzle: payload.db.drizzle,
          sql: sql`
            INSERT INTO "ship_to_addresses" (
              "company_id", "label", "name", "line1", "city", "state", "postal_code", "country",
              "is_default", "created_at", "updated_at"
            ) VALUES (
              ${companyId}, 'Index-B', 'B', '200 Duplicate Lane', 'San Francisco', 'CA', '94102', 'US',
              true, now(), now()
            )
          `,
        }),
      ).rejects.toThrow(/unique|duplicate|ship_to_addresses_one_default/i)

      const defaults = await payload.find({
        collection: 'ship-to-addresses',
        where: {
          and: [{ company: { equals: companyId } }, { isDefault: { equals: true } }],
        },
        limit: 10,
        overrideAccess: true,
      })
      expect(defaults.docs).toHaveLength(1)
    } finally {
      if (companyId != null) await deleteTempCompany(companyId)
    }
  })

  it('staff set-default clears other defaults and syncs company defaultShipTo', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    let companyId: number | null = null
    try {
      const company = await createTempCompany('shipto-staff-def')
      companyId = company.id
      const req = await staffReq()
      const a = await payload.create({
        collection: 'ship-to-addresses',
        data: addressPayload(companyId, 'Staff-A', true),
        req,
      })
      const b = await payload.create({
        collection: 'ship-to-addresses',
        data: addressPayload(companyId, 'Staff-B', false),
        req,
      })

      await payload.update({
        collection: 'ship-to-addresses',
        id: b.id,
        data: { isDefault: true },
        req,
      })

      const rows = await payload.find({
        collection: 'ship-to-addresses',
        where: { company: { equals: companyId } },
        limit: 10,
        overrideAccess: true,
      })
      expect(rows.docs.filter((d) => d.isDefault)).toHaveLength(1)
      expect(rows.docs.find((d) => d.isDefault)?.id).toBe(b.id)

      const refreshed = await payload.findByID({
        collection: 'companies',
        id: companyId,
        overrideAccess: true,
      })
      const synced = shipToFromCompanyDefault(refreshed.defaultShipTo)
      expect(synced?.line1).toBe('500 Test Street')
      expect(a.id).not.toBe(b.id)
    } finally {
      if (companyId != null) await deleteTempCompany(companyId)
    }
  })

  it('staff edit of default address syncs company defaultShipTo', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    let companyId: number | null = null
    try {
      const company = await createTempCompany('shipto-staff-edit')
      companyId = company.id
      const req = await staffReq()
      const row = await payload.create({
        collection: 'ship-to-addresses',
        data: addressPayload(companyId, 'Staff-Edit', true),
        req,
      })

      await payload.update({
        collection: 'ship-to-addresses',
        id: row.id,
        data: { line1: '900 Staff Edited Lane', city: 'Oakland' },
        req,
      })

      const refreshed = await payload.findByID({
        collection: 'companies',
        id: companyId,
        overrideAccess: true,
      })
      const synced = shipToFromCompanyDefault(refreshed.defaultShipTo)
      expect(synced?.line1).toBe('900 Staff Edited Lane')
      expect(synced?.city).toBe('Oakland')
    } finally {
      if (companyId != null) await deleteTempCompany(companyId)
    }
  })

  it('staff delete of default promotes oldest remaining address', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    let companyId: number | null = null
    try {
      const company = await createTempCompany('shipto-staff-del')
      companyId = company.id
      const req = await staffReq()
      const older = await payload.create({
        collection: 'ship-to-addresses',
        data: addressPayload(companyId, 'Staff-Old', false),
        req,
      })
      await new Promise((r) => setTimeout(r, 5))
      const newer = await payload.create({
        collection: 'ship-to-addresses',
        data: addressPayload(companyId, 'Staff-New', true),
        req,
      })

      await payload.delete({
        collection: 'ship-to-addresses',
        id: newer.id,
        req,
      })

      const remaining = await payload.findByID({
        collection: 'ship-to-addresses',
        id: older.id,
        overrideAccess: true,
      })
      expect(remaining.isDefault).toBe(true)

      const refreshed = await payload.findByID({
        collection: 'companies',
        id: companyId,
        overrideAccess: true,
      })
      expect(shipToFromCompanyDefault(refreshed.defaultShipTo)?.line1).toBe('500 Test Street')
    } finally {
      if (companyId != null) await deleteTempCompany(companyId)
    }
  })

  it('clears company defaultShipTo when the last address is deleted', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    let companyId: number | null = null
    try {
      const company = await createTempCompany('shipto-last-del')
      companyId = company.id
      const req = await staffReq()
      const only = await payload.create({
        collection: 'ship-to-addresses',
        data: addressPayload(companyId, 'Only-One', true),
        req,
      })
      await payload.delete({ collection: 'ship-to-addresses', id: only.id, req })

      const refreshed = await payload.findByID({
        collection: 'companies',
        id: companyId,
        overrideAccess: true,
      })
      expect(shipToFromCompanyDefault(refreshed.defaultShipTo)).toBeNull()
    } finally {
      if (companyId != null) await deleteTempCompany(companyId)
    }
  })

  it('accepts manual checkout ship-to when saved addresses are empty', () => {
    const fd = new FormData()
    fd.set('shipToName', 'Manual Dock')
    fd.set('shipToLine1', '100 Manual Ship Lane')
    fd.set('shipToCity', 'San Jose')
    fd.set('shipToState', 'CA')
    fd.set('shipToPostalCode', '95110')
    fd.set('shipToCountry', 'US')
    const parsed = parseCheckoutShipToFromForm(fd)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.shipTo.name).toBe('Manual Dock')
      expect(parsed.shipTo.line1).toBe('100 Manual Ship Lane')
    }
  })

  it('loadDefaultShipToForCheckout returns empty saved book without a default row', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    let companyId: number | null = null
    let userId: number | null = null
    try {
      const company = await createTempCompany('shipto-checkout-empty')
      companyId = company.id
      const email = `vendor-empty-${Date.now()}@local.test`
      const vendor = await payload.create({
        collection: 'users',
        data: {
          email,
          password: 'local-dev-vendor-password',
          role: 'vendor-buyer',
          approved: true,
          company: companyId,
        },
        overrideAccess: true,
      })
      userId = vendor.id

      const loaded = await loadDefaultShipToForCheckout(payload, vendor, String(companyId))
      expect(loaded.savedAddresses).toHaveLength(0)
      expect(loaded.defaultShipTo).toBeNull()
    } finally {
      if (userId != null) {
        await payload.delete({ collection: 'users', id: userId, overrideAccess: true })
      }
      if (companyId != null) await deleteTempCompany(companyId)
    }
  })

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

  async function createTempVendor(companyId: number) {
    const email = `vendor-race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@local.test`
    return payload.create({
      collection: 'users',
      data: {
        email,
        password: 'local-dev-vendor-password',
        role: 'vendor-buyer',
        approved: true,
        company: companyId,
      },
      overrideAccess: true,
    })
  }

  async function defaultCountForCompany(companyId: number) {
    const rows = await payload.find({
      collection: 'ship-to-addresses',
      where: {
        and: [{ company: { equals: companyId } }, { isDefault: { equals: true } }],
      },
      limit: 10,
      overrideAccess: true,
    })
    return rows.docs.length
  }

  it(
    'staff delete-default racing vendor set-default avoids deadlocks and one default',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      let companyId: number | null = null
      let userId: number | null = null
      let errorRounds = 0
      let badDefaultRounds = 0

      try {
        const company = await createTempCompany('shipto-staff-vendor-del')
        companyId = company.id
        const vendor = await createTempVendor(companyId)
        userId = vendor.id
        const staff = await staffUser()
        const staffRequest = createPayloadReq(payload, staff)

        for (let round = 0; round < RACE_ROUNDS; round++) {
          const stamp = `${Date.now()}-${round}`
          const a = await createVendorShipToAddress(
            payload,
            vendor,
            String(companyId),
            sampleAddress(`sv-del-a-${stamp}`),
          )
          const b = await createVendorShipToAddress(
            payload,
            vendor,
            String(companyId),
            sampleAddress(`sv-del-b-${stamp}`),
          )
          await setVendorDefaultShipToAddress(payload, vendor, String(companyId), a.id)

          try {
            await Promise.all([
              payload.delete({ collection: 'ship-to-addresses', id: a.id, req: staffRequest }),
              setVendorDefaultShipToAddress(payload, vendor, String(companyId), b.id),
            ])
          } catch {
            errorRounds++
          }

          const defaults = await defaultCountForCompany(companyId)
          if (defaults !== 1) badDefaultRounds++

          const rows = await payload.find({
            collection: 'ship-to-addresses',
            where: { company: { equals: companyId } },
            limit: 50,
            overrideAccess: true,
          })
          for (const row of rows.docs.filter((d) => String(d.label ?? '').includes(stamp))) {
            await payload.delete({ collection: 'ship-to-addresses', id: row.id, overrideAccess: true })
          }
        }

        expect(errorRounds).toBe(0)
        expect(badDefaultRounds).toBe(0)
      } finally {
        if (userId != null) {
          await payload.delete({ collection: 'users', id: userId, overrideAccess: true })
        }
        if (companyId != null) await deleteTempCompany(companyId)
      }
    },
    240_000,
  )

  it(
    'staff set-default racing vendor delete-default avoids deadlocks and one default',
    async () => {
      if (!process.env.DATABASE_URL || !payload) return
      let companyId: number | null = null
      let userId: number | null = null
      let errorRounds = 0
      let badDefaultRounds = 0

      try {
        const company = await createTempCompany('shipto-staff-vendor-set')
        companyId = company.id
        const vendor = await createTempVendor(companyId)
        userId = vendor.id
        const staff = await staffUser()
        const staffRequest = createPayloadReq(payload, staff)

        for (let round = 0; round < RACE_ROUNDS; round++) {
          const stamp = `${Date.now()}-${round}`
          const a = await createVendorShipToAddress(
            payload,
            vendor,
            String(companyId),
            sampleAddress(`sv-set-a-${stamp}`),
          )
          const b = await createVendorShipToAddress(
            payload,
            vendor,
            String(companyId),
            sampleAddress(`sv-set-b-${stamp}`),
          )
          await setVendorDefaultShipToAddress(payload, vendor, String(companyId), a.id)

          try {
            await Promise.all([
              payload.update({
                collection: 'ship-to-addresses',
                id: b.id,
                data: { isDefault: true },
                req: staffRequest,
              }),
              deleteVendorShipToAddress(payload, vendor, String(companyId), a.id),
            ])
          } catch {
            errorRounds++
          }

          const defaults = await defaultCountForCompany(companyId)
          if (defaults !== 1) badDefaultRounds++

          const rows = await payload.find({
            collection: 'ship-to-addresses',
            where: { company: { equals: companyId } },
            limit: 50,
            overrideAccess: true,
          })
          for (const row of rows.docs.filter((d) => String(d.label ?? '').includes(stamp))) {
            await payload.delete({ collection: 'ship-to-addresses', id: row.id, overrideAccess: true })
          }
        }

        expect(errorRounds).toBe(0)
        expect(badDefaultRounds).toBe(0)
      } finally {
        if (userId != null) {
          await payload.delete({ collection: 'users', id: userId, overrideAccess: true })
        }
        if (companyId != null) await deleteTempCompany(companyId)
      }
    },
    240_000,
  )

  it('promotes the oldest remaining address when the default is deleted', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    let companyId: number | null = null
    let userId: number | null = null
    try {
      const company = await createTempCompany('shipto-vendor-promote')
      companyId = company.id
      const email = `vendor-promote-${Date.now()}@local.test`
      const vendor = await payload.create({
        collection: 'users',
        data: {
          email,
          password: 'local-dev-vendor-password',
          role: 'vendor-buyer',
          approved: true,
          company: companyId,
        },
        overrideAccess: true,
      })
      userId = vendor.id
      const stamp = Date.now()
      const first = await createVendorShipToAddress(
        payload,
        vendor,
        String(companyId),
        sampleAddress(`del-a-${stamp}`),
      )
      await new Promise((r) => setTimeout(r, 5))
      const second = await createVendorShipToAddress(
        payload,
        vendor,
        String(companyId),
        sampleAddress(`del-b-${stamp}`),
      )
      await setVendorDefaultShipToAddress(payload, vendor, String(companyId), second.id)
      await deleteVendorShipToAddress(payload, vendor, String(companyId), second.id)

      const remaining = await listVendorShipToAddresses(payload, vendor, String(companyId))
      const firstRow = remaining.find((a) => a.id === first.id)
      expect(firstRow?.isDefault).toBe(true)

      await deleteVendorShipToAddress(payload, vendor, String(companyId), first.id)
    } finally {
      if (userId != null) {
        await payload.delete({ collection: 'users', id: userId, overrideAccess: true })
      }
      if (companyId != null) await deleteTempCompany(companyId)
    }
  })
})
