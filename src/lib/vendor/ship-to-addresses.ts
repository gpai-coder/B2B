import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { getUserCompanyId } from '@/access'
import { vendorBuyerIsApproved } from '@/lib/access/vendor-gate'
import { SHIP_TO_TRUSTED_MUTATION } from '@/lib/vendor/ship-to-trusted'
import { shipToFromCompanyDefault, type ShipToFields } from '@/lib/checkout/ship-to'
import { createPayloadReq } from '@/lib/payload-req'

export const SHIP_TO_DEFAULT_INDEX_NAME = 'ship_to_addresses_one_default_per_company'

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
  if (!vendorBuyerIsApproved(user)) throw new ShipToAddressValidationError(PENDING_APPROVAL)
  const userCompany = getUserCompanyId(user)
  if (!userCompany || String(userCompany) !== companyId) {
    throw new ShipToAddressValidationError('Address not found.')
  }
}

function trustedReq(payload: Payload, user: User | null): PayloadRequest {
  const req = createPayloadReq(payload, user)
  req.context = { ...(req.context as Record<string, unknown>), [SHIP_TO_TRUSTED_MUTATION]: true }
  return req
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

async function withCompanyLockOnReq(
  payload: Payload,
  _user: User | null,
  companyId: number,
  req: PayloadRequest,
  fn: (req: PayloadRequest) => Promise<void>,
): Promise<void> {
  const ownsTx = req.transactionID == null
  const previousTransactionId = req.transactionID
  let ownedTransactionId: string | number | null | undefined
  if (ownsTx) {
    ownedTransactionId = await payload.db.beginTransaction()
    if (ownedTransactionId != null) req.transactionID = ownedTransactionId
  }
  try {
    await lockCompanyRow(payload, companyId, req)
    await fn(req)
    if (ownsTx && ownedTransactionId != null) await payload.db.commitTransaction(ownedTransactionId)
  } catch (err) {
    if (ownsTx && ownedTransactionId != null) await payload.db.rollbackTransaction(ownedTransactionId)
    throw err
  } finally {
    if (ownsTx) req.transactionID = previousTransactionId
  }
}

async function withCompanyLock<T>(
  payload: Payload,
  user: User | null,
  companyId: number,
  fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  const req = trustedReq(payload, user)
  let transactionID: string | number | null | undefined
  try {
    transactionID = await payload.db.beginTransaction()
  } catch (err) {
    throw err
  }
  if (transactionID != null) req.transactionID = transactionID
  try {
    await lockCompanyRow(payload, companyId, req)
    const result = await fn(req)
    if (transactionID != null) await payload.db.commitTransaction(transactionID)
    return result
  } catch (err) {
    if (transactionID != null) await payload.db.rollbackTransaction(transactionID)
    throw err
  }
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

export function companyIdFromDoc(doc: Record<string, unknown>): number | null {
  const raw = doc.company
  if (raw == null) return null
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    return Number((raw as { id: number }).id)
  }
  return Number(raw)
}

async function clearDefaultFlagsExcept(
  payload: Payload,
  companyId: number,
  keepId: string | number | null,
  req: PayloadRequest,
): Promise<void> {
  const all = await payload.find({
    collection: 'ship-to-addresses',
    where: {
      and: [{ company: { equals: companyId } }, { isDefault: { equals: true } }],
    },
    limit: 200,
    req,
    overrideAccess: true,
  })
  for (const row of all.docs) {
    if (keepId != null && String(row.id) === String(keepId)) continue
    await payload.update({
      collection: 'ship-to-addresses',
      id: row.id,
      data: { isDefault: false },
      req,
      overrideAccess: true,
    })
  }
}

export async function clearDefaultFlagsExceptSql(
  payload: Payload,
  companyId: number,
  keepId: string | number | null,
  req: PayloadRequest,
): Promise<void> {
  const txId = await resolveTransactionId(req)
  if (txId == null) {
    await clearDefaultFlagsExcept(payload, companyId, keepId, req)
    return
  }
  const drizzle = drizzleForTransaction(payload, txId)
  if (keepId == null) {
    await payload.db.execute({
      drizzle,
      sql: sql`
        UPDATE "ship_to_addresses"
        SET "is_default" = false
        WHERE "company_id" = ${companyId} AND "is_default" = true
      `,
    })
    return
  }
  await payload.db.execute({
    drizzle,
    sql: sql`
      UPDATE "ship_to_addresses"
      SET "is_default" = false
      WHERE "company_id" = ${companyId} AND "is_default" = true AND "id" <> ${keepId}
    `,
  })
}

export const clearDefaultFlagsExceptForStaff = clearDefaultFlagsExcept

export { withCompanyLockOnReq }

async function findDefaultAddressId(
  payload: Payload,
  companyId: number,
  req: PayloadRequest,
): Promise<string | null> {
  const rows = await payload.find({
    collection: 'ship-to-addresses',
    where: {
      and: [{ company: { equals: companyId } }, { isDefault: { equals: true } }],
    },
    limit: 2,
    req,
    overrideAccess: true,
  })
  if (rows.docs.length === 0) return null
  return String(rows.docs[0]!.id)
}

async function syncDefaultFromAddressUnderLock(
  payload: Payload,
  companyId: number,
  addressId: string,
  req: PayloadRequest,
): Promise<void> {
  const defaultId = await findDefaultAddressId(payload, companyId, req)
  if (defaultId !== addressId) return
  const doc = await payload.findByID({
    collection: 'ship-to-addresses',
    id: addressId,
    req,
    overrideAccess: true,
  })
  if (!doc?.isDefault) return
  await syncCompanyDefaultShipTo(
    payload,
    companyId,
    mapDoc(doc as unknown as Record<string, unknown>).shipTo,
    req,
  )
}

export const syncDefaultFromAddressUnderLockForStaff = syncDefaultFromAddressUnderLock

export async function promoteDefaultAfterDelete(
  payload: Payload,
  companyId: number,
  req: PayloadRequest,
): Promise<void> {
  let defaultId = await findDefaultAddressId(payload, companyId, req)
  if (defaultId) {
    await syncDefaultFromAddressUnderLock(payload, companyId, defaultId, req)
    return
  }

  const remaining = await payload.find({
    collection: 'ship-to-addresses',
    where: { company: { equals: companyId } },
    sort: 'createdAt',
    limit: 1,
    req,
    overrideAccess: true,
  })
  const next = remaining.docs[0]
  if (!next) {
    await syncCompanyDefaultShipTo(payload, companyId, null, req)
    return
  }

  await clearDefaultFlagsExcept(payload, companyId, next.id, req)
  await payload.update({
    collection: 'ship-to-addresses',
    id: next.id,
    data: { isDefault: true },
    req,
    overrideAccess: true,
  })
  defaultId = await findDefaultAddressId(payload, companyId, req)
  if (defaultId) {
    await syncDefaultFromAddressUnderLock(payload, companyId, defaultId, req)
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
    req: req ?? trustedReq(payload, user),
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
  const numericCompany = Number(companyId)

  return withCompanyLock(payload, user, numericCompany, async (req) => {
    const existing = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: numericCompany } },
      limit: 1,
      req,
      overrideAccess: true,
    })
    const makeDefault = existing.totalDocs === 0

    if (makeDefault) {
      await clearDefaultFlagsExcept(payload, numericCompany, null, req)
    }

    const created = await payload.create({
      collection: 'ship-to-addresses',
      data: {
        company: numericCompany,
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
      overrideAccess: true,
    })

    if (makeDefault) {
      await syncDefaultFromAddressUnderLock(payload, numericCompany, String(created.id), req)
    }

    const refreshed = await payload.findByID({
      collection: 'ship-to-addresses',
      id: created.id,
      req,
      overrideAccess: true,
    })
    return mapDoc(refreshed as unknown as Record<string, unknown>)
  })
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
  const numericCompany = Number(companyId)
  const req = trustedReq(payload, user)

  const existing = await payload.findByID({
    collection: 'ship-to-addresses',
    id: addressId,
    overrideAccess: true,
    req,
  })
  if (!existing) throw new ShipToAddressValidationError('Address not found.')
  const docCompany =
    typeof existing.company === 'object' ? existing.company.id : existing.company
  if (String(docCompany) !== companyId) throw new ShipToAddressValidationError('Address not found.')

  const wasDefault = Boolean(existing.isDefault)

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
    overrideAccess: true,
  })

  if (wasDefault) {
    await withCompanyLock(payload, user, numericCompany, async (txReq) => {
      await syncDefaultFromAddressUnderLock(payload, numericCompany, addressId, txReq)
    })
  }

  return mapDoc(updated as unknown as Record<string, unknown>)
}

export async function deleteVendorShipToAddress(
  payload: Payload,
  user: User,
  companyId: string,
  addressId: string,
): Promise<void> {
  assertApprovedVendor(user, companyId)
  const numericCompany = Number(companyId)

  await withCompanyLock(payload, user, numericCompany, async (req) => {
    const existing = await payload.findByID({
      collection: 'ship-to-addresses',
      id: addressId,
      overrideAccess: true,
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
      overrideAccess: true,
    })

    if (!wasDefault) return

    await promoteDefaultAfterDelete(payload, numericCompany, req)
  })
}

export async function setVendorDefaultShipToAddress(
  payload: Payload,
  user: User,
  companyId: string,
  addressId: string,
): Promise<ShipToAddressRecord> {
  assertApprovedVendor(user, companyId)
  const numericCompany = Number(companyId)

  return withCompanyLock(payload, user, numericCompany, async (req) => {
    const target = await payload.findByID({
      collection: 'ship-to-addresses',
      id: addressId,
      overrideAccess: true,
      req,
    })
    if (!target) throw new ShipToAddressValidationError('Address not found.')
    const docCompany = typeof target.company === 'object' ? target.company.id : target.company
    if (String(docCompany) !== companyId) throw new ShipToAddressValidationError('Address not found.')

    await clearDefaultFlagsExcept(payload, numericCompany, addressId, req)
    await payload.update({
      collection: 'ship-to-addresses',
      id: addressId,
      data: { isDefault: true },
      req,
      overrideAccess: true,
    })

    await syncDefaultFromAddressUnderLock(payload, numericCompany, addressId, req)

    const fresh = await payload.findByID({
      collection: 'ship-to-addresses',
      id: addressId,
      req,
      overrideAccess: true,
    })
    return mapDoc(fresh as unknown as Record<string, unknown>)
  })
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

  const any = await payload.find({
    collection: 'ship-to-addresses',
    where: { company: { equals: companyId } },
    limit: 1,
    overrideAccess: true,
  })
  if (any.docs[0]) return

  await withCompanyLock(payload, null, companyId, async (req) => {
    const again = await payload.find({
      collection: 'ship-to-addresses',
      where: { company: { equals: companyId } },
      limit: 1,
      req,
      overrideAccess: true,
    })
    if (again.docs[0]) return

    await clearDefaultFlagsExcept(payload, companyId, null, req)
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
      req,
      overrideAccess: true,
    })
    await syncDefaultFromAddressUnderLock(payload, companyId, String(created.id), req)
  })
}

/** Restore Pacific (or any company) default address + company defaultShipTo for tests. */
export async function restoreCompanyDefaultShipToState(
  payload: Payload,
  companyId: number,
  defaultAddressId: string | null,
  defaultShipTo: ShipToFields | null,
): Promise<void> {
  await withCompanyLock(payload, null, companyId, async (req) => {
    if (defaultAddressId) {
      await clearDefaultFlagsExcept(payload, companyId, defaultAddressId, req)
      await payload.update({
        collection: 'ship-to-addresses',
        id: defaultAddressId,
        data: { isDefault: true },
        req,
        overrideAccess: true,
      })
      await syncDefaultFromAddressUnderLock(payload, companyId, defaultAddressId, req)
    } else {
      await clearDefaultFlagsExcept(payload, companyId, null, req)
      await syncCompanyDefaultShipTo(payload, companyId, defaultShipTo, req)
    }
  })
}

export async function loadDefaultShipToForCheckout(
  payload: Payload,
  user: User,
  companyId: string,
): Promise<{ defaultShipTo: ShipToFields | null; savedAddresses: ShipToAddressRecord[] }> {
  assertApprovedVendor(user, companyId)
  const req = trustedReq(payload, user)
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
