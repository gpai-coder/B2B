import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
} from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from '@/access'
import {
  clearDefaultFlagsExceptSql,
  companyIdFromDoc,
  promoteDefaultAfterDelete,
  syncDefaultFromAddressUnderLockForStaff,
  withCompanyLockOnReq,
} from '@/lib/vendor/ship-to-addresses'

function resolveCompanyId(
  data: Record<string, unknown> | undefined,
  doc: Record<string, unknown> | undefined,
): number | null {
  const raw = data?.company ?? doc?.company
  if (raw == null) return null
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    return Number((raw as { id: number }).id)
  }
  return Number(raw)
}

function dataWantsDefault(data: Record<string, unknown> | undefined): boolean {
  if (!data || !('isDefault' in data)) return false
  return Boolean(data.isDefault)
}

export const shipToStaffBeforeChange: CollectionBeforeChangeHook = async (args) => {
  const user = args.req.user as User | undefined
  if (!user || !isStaff(user)) return args.data

  const companyId = resolveCompanyId(
    args.data as Record<string, unknown>,
    args.originalDoc as Record<string, unknown>,
  )
  if (companyId == null || Number.isNaN(companyId)) return args.data

  const wantsDefault = dataWantsDefault(args.data as Record<string, unknown>)
  const keepId = args.operation === 'update' && args.originalDoc ? args.originalDoc.id : null
  await withCompanyLockOnReq(args.req.payload, user, companyId, args.req, async (lockedReq) => {
    if (wantsDefault) await clearDefaultFlagsExceptSql(args.req.payload, companyId, keepId, lockedReq)
  })

  return args.data
}

export const shipToStaffBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const user = req.user as User | undefined
  if (!user || !isStaff(user)) return

  const existing = await req.payload.findByID({
    collection: 'ship-to-addresses',
    id,
    req,
    overrideAccess: true,
    depth: 0,
  })
  const companyId = existing ? companyIdFromDoc(existing as unknown as Record<string, unknown>) : null
  if (companyId == null) return

  await withCompanyLockOnReq(req.payload, user, companyId, req, async () => {})
}

export const shipToStaffAfterChange: CollectionAfterChangeHook = async ({ doc, req, previousDoc }) => {
  const user = req.user as User | undefined
  if (!user || !isStaff(user)) return

  const companyId = companyIdFromDoc(doc as Record<string, unknown>)
  if (companyId == null) return

  const isDefault = Boolean(doc.isDefault)
  const wasDefault = Boolean(previousDoc?.isDefault)
  if (!isDefault && !wasDefault) return

  await withCompanyLockOnReq(req.payload, user, companyId, req, async (lockedReq) => {
    if (isDefault) {
      await syncDefaultFromAddressUnderLockForStaff(req.payload, companyId, String(doc.id), lockedReq)
    } else if (wasDefault && !isDefault) {
      await promoteDefaultAfterDelete(req.payload, companyId, lockedReq)
    }
  })
}

export const shipToStaffAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const user = req.user as User | undefined
  if (!user || !isStaff(user)) return
  if (!doc?.isDefault) return

  const companyId = companyIdFromDoc(doc as Record<string, unknown>)
  if (companyId == null) return

  await withCompanyLockOnReq(req.payload, user, companyId, req, async (lockedReq) => {
    await promoteDefaultAfterDelete(req.payload, companyId, lockedReq)
  })
}
