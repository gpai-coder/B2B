import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { getUserCompanyId } from '@/access'
import { shipToFromCompanyDefault, type ShipToFields } from '@/lib/checkout/ship-to'
import { createPayloadReq } from '@/lib/payload-req'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export type ShipToAddressRecord = {
  id: string
  label: string
  isDefault: boolean
  shipTo: ShipToFields
}

export class ShipToAddressValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShipToAddressValidationError'
  }
}

function assertApprovedVendor(user: User, companyId: string): void {
  if (user.role !== 'vendor-buyer') throw new Error('Unauthorized')
  if (!user.approved) throw new ShipToAddressValidationError(PENDING_APPROVAL)
  const userCompany = getUserCompanyId(user)
  if (!userCompany || String(userCompany) !== companyId) {
    throw new ShipToAddressValidationError('Address not found.')
  }
}

async function resolveTransactionId(req: PayloadRequest): Promise<string | number | null | undefined> {
  let id = req.transactionID
  if (id instanceof Promise) id = await id
  return id
}

function drizzleForTransaction(payload: Payload, txId: string | number) {
  const sessions = (payload.db as { sessions?: Record<string, { db?: typeof payload.db.drizzle }> }).sessions
  const sessionDb = sessions?.[String(txId)]?.db
  if (!sessionDb) {
    throw new Error(`Missing transaction session for company lock (${String(txId)})`)
  }
  return sessionDb
}

async function lockCompanyRow(payload: Payload, companyId: number, req: PayloadRequest): Promise<void> {
  const txId = await resolveTransactionId(req)
  if (txId == null) throw new Error('Company lock requires an active transaction.')
  const drizzle = drizzleForTransaction(payload, txId)
  await payload.db.execute({
    drizzle,
    sql: sql`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`,
  })
}

function parseShipToInput(input: {
  label: string
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country?: string
}): Omit<ShipToAddressRecord, 'id' | 'isDefault'> & { label: string } {
  const label = input.label.trim()
  const name = input.name.trim()
  const line1 = input.line1.trim()
  const city = input.city.trim()
  const state = input.state.trim()
  const postalCode = input.postalCode.trim()
  const country = (input.country ?? 'US').trim() || 'US'
  const line2 = input.line2?.trim() || undefined
  if (!label || !name || !line1 || !city || !state || !postalCode) {
    throw new ShipToAddressValidationError('Complete address and label are required.')
  }
  return {
    label,
    shipTo: { name, line1, line2, city, state, postalCode, country },
  }
}

function companyDefaultFromShipTo(ship: ShipToFields) {
  return {
    name: ship.name,
    line1: ship.line1,
    line2: ship.line2 ?? null,
    city: ship.city,
    state: ship.state,
    postalCode: ship.postalCode,
    country: ship.country ?? 'US',
  }
}

async function syncCompanyDefaultShipTo(
  payload: Payload,
  companyId: number,
  ship: ShipToFields | null,
  req: PayloadRequest,
): Promise<void> {
  if (!ship) {
    await payload.update({
      collection: 'companies',
      id: companyId,
      data: {
        defaultShipTo: {
          name: null,
          line1: null,
          line2: null,
          city: null,
          state: null,
          postalCode: null,
          country: 'US',
        },
      },
      req,
      overrideAccess: true,
    })
    return
  }
  await payload.update({
    collection: 'companies',
    id: companyId,
    data: { defaultShipTo: companyDefaultFromShipTo(ship) },
    req,
    overrideAccess: true,
  })
}

function mapDoc(doc: Record<string, unknown>): ShipToAddressRecord {
  return {
    id: String(doc.id),
    label: String(doc.label ?? ''),
    isDefault: Boolean(doc.isDefault),
    shipTo: {
      name: String(doc.name ?? ''),
      line1: String(doc.line1 ?? ''),
      line2: doc.line2 ? String(doc.line2) : undefined,
      city: String(doc.city ?? ''),
      state: String(doc.state ?? ''),
      postalCode: String(doc.postalCode ?? ''),
      country: String(doc.country ?? 'US'),
    },
  }
}

export async function listVendorShipToAddresses(
  payload: Payload,
  user: User,
  companyId: string,
  req?: PayloadRequest,
): Promise<ShipToAddressRecord[]> {
  assertApprovedVendor(user, companyId)
  const rows = await payload.find({
    collection: 'ship-to-addresses',
    where: { company: { equals: Number(companyId) } },
    sort: '-isDefault,label',
    limit: 100,
    overrideAccess: false,
    req: req ?? createPayloadReq(payload, user),
  })
  return rows.docs.map((d) => mapDoc(d as unknown as Record<string, unknown>))
}

export async function createVendorShipToAddress(
  payload: Payload,
  user: User,
  companyId: string,
  input: Parameters<typeof parseShipToInput>[0],
): Promise<ShipToAddressRecord> {
  assertApprovedVendor(user, companyId)
  const parsed = parseShipToInput(input)
  const req = createPayloadReq(payload, user)
  const existing = await payload.find({
    collection: 'ship-to-addresses',
    where: { company: { equals: Number(companyId) } },
    limit: 1,
    overrideAccess: false,
    req,
  })
  const makeDefault = existing.docs.length === 0
  const created = await payload.create({
    collection: 'ship-to-addresses',
    data: {
      company: Number(companyId),
      label: parsed.label,
      name: parsed.shipTo.name,
      line1: parsed.shipTo.line1,
      line2: parsed.shipTo.line2,
      city: parsed.shipTo.city,
      state: parsed.shipTo.state,
      postalCode: parsed.shipTo.postalCode,
      country: parsed.shipTo.country,
      isDefault: makeDefault,
    },
    req,
    overrideAccess: false,
  })
  if (makeDefault) {
    await syncCompanyDefaultFromAddress(payload, user, companyId, String(created.id))
    const refreshed = await payload.findByID({
      collection: 'ship-to-addresses',
      id: created.id,
      overrideAccess: false,
      req,
    })
    return mapDoc(refreshed as unknown as Record<string, unknown>)
  }
  return mapDoc(created as unknown as Record<string, unknown>)
}

export async function updateVendorShipToAddress(
  payload: Payload,
  user: User,
  companyId: string,
  addressId: string,
  input: Parameters<typeof parseShipToInput>[0],
): Promise<ShipToAddressRecord> {
  assertApprovedVendor(user, companyId)
  const parsed = parseShipToInput(input)
  const req = createPayloadReq(payload, user)
  const existing = await payload.findByID({
    collection: 'ship-to-addresses',
    id: addressId,
    overrideAccess: false,
    req,
  })
  if (!existing) throw new ShipToAddressValidationError('Address not found.')
  const docCompany =
    typeof existing.company === 'object' ? existing.company.id : existing.company
  if (String(docCompany) !== companyId) throw new ShipToAddressValidationError('Address not found.')

  const updated = await payload.update({
    collection: 'ship-to-addresses',
    id: addressId,
    data: {
      label: parsed.label,
      name: parsed.shipTo.name,
      line1: parsed.shipTo.line1,
      line2: parsed.shipTo.line2,
      city: parsed.shipTo.city,
      state: parsed.shipTo.state,
      postalCode: parsed.shipTo.postalCode,
      country: parsed.shipTo.country,
    },
    req,
    overrideAccess: false,
  })
  if (updated.isDefault) {
    await syncCompanyDefaultFromAddress(payload, user, companyId, String(updated.id))
  }
  return mapDoc(updated as unknown as Record<string, unknown>)
}

async function syncCompanyDefaultFromAddress(
  payload: Payload,
  user: User,
  companyId: string,
  addressId: string,
): Promise<void> {
  const req = createPayloadReq(payload, user)
  let transactionID: string | number | null | undefined
  try {
    transactionID = await payload.db.beginTransaction()
  } catch (err) {
    throw err
  }
  if (transactionID != null) req.transactionID = transactionID
  try {
    await lockCompanyRow(payload, Number(companyId), req)
    const doc = await payload.findByID({
      collection: 'ship-to-addresses',
      id: addressId,
      req,
      overrideAccess: true,
    })
    await syncCompanyDefaultShipTo(payload, Number(companyId), mapDoc(doc as unknown as Record<string, unknown>).shipTo, req)
    if (transactionID != null) await payload.db.commitTransaction(transactionID)
  } catch (err) {
    if (transactionID != null) await payload.db.rollbackTransaction(transactionID)
    throw err
  }
}

export async function deleteVendorShipToAddress(
  payload: Payload,
  user: User,
  companyId: string,
  addressId: string,
): Promise<void> {
  assertApprovedVendor(user, companyId)
  const req = createPayloadReq(payload, user)
  const existing = await payload.findByID({
    collection: 'ship-to-addresses',
    id: addressId,
    overrideAccess: false,
    req,
  })
  if (!existing) throw new ShipToAddressValidationError('Address not found.')
  const docCompany =
    typeof existing.company === 'object' ? existing.company.id : existing.company
  if (String(docCompany) !== companyId) throw new ShipToAddressValidationError('Address not found.')

  const wasDefault = Boolean(existing.isDefault)
  await payload.delete({
    collection: 'ship-to-addresses',
    id: addressId,
    req,
    overrideAccess: false,
  })

  if (!wasDefault) return

  let transactionID: string | number | null | undefined
  const txReq = createPayloadReq(payload, user)
  try {
    transactionID = await payload.db.beginTransaction()
  } catch (err) {
    throw err
  }
  if (transactionID != null) txReq.transactionID = transactionID
  try {
    await lockCompanyRow(payload, Number(companyId), txReq)
    const remaining = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: Number(companyId) } },
      sort: '-createdAt',
      limit: 1,
      req: txReq,
      overrideAccess: true,
    })
    const next = remaining.docs[0]
    if (next) {
      await payload.update({
        collection: 'ship-to-addresses',
        id: next.id,
        data: { isDefault: true },
        req: txReq,
        overrideAccess: true,
      })
      await syncCompanyDefaultShipTo(
        payload,
        Number(companyId),
        mapDoc(next as unknown as Record<string, unknown>).shipTo,
        txReq,
      )
    } else {
      await syncCompanyDefaultShipTo(payload, Number(companyId), null, txReq)
    }
    if (transactionID != null) await payload.db.commitTransaction(transactionID)
  } catch (err) {
    if (transactionID != null) await payload.db.rollbackTransaction(transactionID)
    throw err
  }
}

export async function setVendorDefaultShipToAddress(
  payload: Payload,
  user: User,
  companyId: string,
  addressId: string,
): Promise<ShipToAddressRecord> {
  assertApprovedVendor(user, companyId)
  const req = createPayloadReq(payload, user)
  const target = await payload.findByID({
    collection: 'ship-to-addresses',
    id: addressId,
    overrideAccess: false,
    req,
  })
  if (!target) throw new ShipToAddressValidationError('Address not found.')
  const docCompany = typeof target.company === 'object' ? target.company.id : target.company
  if (String(docCompany) !== companyId) throw new ShipToAddressValidationError('Address not found.')

  let transactionID: string | number | null | undefined
  try {
    transactionID = await payload.db.beginTransaction()
  } catch (err) {
    throw err
  }
  if (transactionID != null) req.transactionID = transactionID

  try {
    await lockCompanyRow(payload, Number(companyId), req)

    const all = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: Number(companyId) } },
      limit: 200,
      req,
      overrideAccess: true,
    })
    for (const row of all.docs) {
      if (!row.isDefault) continue
      if (String(row.id) === String(addressId)) continue
      await payload.update({
        collection: 'ship-to-addresses',
        id: row.id,
        data: { isDefault: false },
        req,
        overrideAccess: true,
      })
    }
    await payload.update({
      collection: 'ship-to-addresses',
      id: addressId,
      data: { isDefault: true },
      req,
      overrideAccess: true,
    })

    const fresh = await payload.findByID({
      collection: 'ship-to-addresses',
      id: addressId,
      req,
      overrideAccess: true,
    })
    const mapped = mapDoc(fresh as unknown as Record<string, unknown>)
    await syncCompanyDefaultShipTo(payload, Number(companyId), mapped.shipTo, req)
    if (transactionID != null) await payload.db.commitTransaction(transactionID)
    return mapped
  } catch (err) {
    if (transactionID != null) await payload.db.rollbackTransaction(transactionID)
    throw err
  }
}

export async function ensureCompanyDefaultShipToAddressFromGroup(
  payload: Payload,
  companyId: number,
): Promise<void> {
  const company = await payload.findByID({
    collection: 'companies',
    id: companyId,
    overrideAccess: true,
  })
  const ship = shipToFromCompanyDefault(company.defaultShipTo)
  if (!ship) return

  const existingDefault = await payload.find({
    collection: 'ship-to-addresses',
    where: {
      and: [{ company: { equals: companyId } }, { isDefault: { equals: true } }],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (existingDefault.docs[0]) return

  const any = await payload.find({
    collection: 'ship-to-addresses',
    where: { company: { equals: companyId } },
    limit: 1,
    overrideAccess: true,
  })
  if (any.docs[0]) {
    await applyDefaultAddressInternal(payload, companyId, String(any.docs[0].id))
    return
  }

  const created = await payload.create({
    collection: 'ship-to-addresses',
    data: {
      company: companyId,
      label: 'Primary',
      name: ship.name,
      line1: ship.line1,
      line2: ship.line2,
      city: ship.city,
      state: ship.state,
      postalCode: ship.postalCode,
      country: ship.country,
      isDefault: true,
    },
    overrideAccess: true,
  })
  await applyDefaultAddressInternal(payload, companyId, String(created.id))
}

async function applyDefaultAddressInternal(
  payload: Payload,
  companyId: number,
  addressId: string,
): Promise<void> {
  const req = createPayloadReq(payload, null)
  const transactionID = await payload.db.beginTransaction()
  if (transactionID != null) req.transactionID = transactionID
  try {
    await lockCompanyRow(payload, companyId, req)
    const all = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: companyId } },
      limit: 200,
      req,
      overrideAccess: true,
    })
    for (const row of all.docs) {
      if (!row.isDefault) continue
      if (String(row.id) === String(addressId)) continue
      await payload.update({
        collection: 'ship-to-addresses',
        id: row.id,
        data: { isDefault: false },
        req,
        overrideAccess: true,
      })
    }
    await payload.update({
      collection: 'ship-to-addresses',
      id: addressId,
      data: { isDefault: true },
      req,
      overrideAccess: true,
    })
    const fresh = await payload.findByID({
      collection: 'ship-to-addresses',
      id: addressId,
      req,
      overrideAccess: true,
    })
    await syncCompanyDefaultShipTo(
      payload,
      companyId,
      mapDoc(fresh as unknown as Record<string, unknown>).shipTo,
      req,
    )
    if (transactionID != null) await payload.db.commitTransaction(transactionID)
  } catch (err) {
    if (transactionID != null) await payload.db.rollbackTransaction(transactionID)
    throw err
  }
}

export async function loadDefaultShipToForCheckout(
  payload: Payload,
  user: User,
  companyId: string,
): Promise<{ defaultShipTo: ShipToFields | null; savedAddresses: ShipToAddressRecord[] }> {
  assertApprovedVendor(user, companyId)
  const req = createPayloadReq(payload, user)
  const savedAddresses = await listVendorShipToAddresses(payload, user, companyId, req)
  const defaultRow = savedAddresses.find((a) => a.isDefault)
  if (defaultRow) {
    return { defaultShipTo: defaultRow.shipTo, savedAddresses }
  }
  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req,
  })
  return { defaultShipTo: shipToFromCompanyDefault(company.defaultShipTo), savedAddresses }
}
