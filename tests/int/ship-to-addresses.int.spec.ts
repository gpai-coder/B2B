// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import {
  createVendorShipToAddress,
  deleteVendorShipToAddress,
  listVendorShipToAddresses,
  setVendorDefaultShipToAddress,
  ShipToAddressValidationError,
  updateVendorShipToAddress,
} from '@/lib/vendor/ship-to-addresses'

const POOL_MAX = Number(process.env.DB_POOL_MAX ?? 5)

describe('vendor ship-to addresses', () => {
  let payload: Payload
  let pacificCompanyId: string
  let bayCompanyId: string
  let pacificUserId: number
  let bayUserId: number

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

  async function userById(id: number) {
    return payload.findByID({ collection: 'users', id, overrideAccess: true })
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

  it('blocks unapproved Bay buyer from creating addresses', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const bayUser = await userById(bayUserId)
    await expect(
      createVendorShipToAddress(
        payload,
        bayUser,
        bayCompanyId,
        sampleAddress(`blocked-${Date.now()}`),
      ),
    ).rejects.toBeInstanceOf(ShipToAddressValidationError)
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
