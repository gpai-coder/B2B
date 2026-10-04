import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from '@/access'
import {
  assertFrozenOrderFieldsUnchanged,
  assertValidStatusTransition,
  lockOrderRowIfInTransaction,
  type OrderStatus,
} from '@/lib/orders/order-workflow'
import { appendOrderStatusEvent } from '@/lib/orders/order-events'

export const orderStaffBeforeChange: CollectionBeforeChangeHook = async (args) => {
  if (args.operation === 'create' || !args.originalDoc?.id) return args.data

  const prevStatus = String(args.originalDoc.status ?? 'draft') as OrderStatus
  const nextStatus = (args.data?.status != null ? String(args.data.status) : prevStatus) as OrderStatus

  assertFrozenOrderFieldsUnchanged(
    args.originalDoc as unknown as Record<string, unknown>,
    (args.data ?? {}) as Record<string, unknown>,
  )

  if (nextStatus !== prevStatus) {
    await lockOrderRowIfInTransaction(args.req.payload, Number(args.originalDoc.id), args.req)
    assertValidStatusTransition(prevStatus, nextStatus)
  }

  return args.data
}

export const orderStaffAfterChange: CollectionAfterChangeHook = async ({ doc, req, previousDoc }) => {
  const prevStatus = previousDoc?.status ? String(previousDoc.status) : null
  const nextStatus = doc.status ? String(doc.status) : null
  if (!prevStatus || !nextStatus || prevStatus === nextStatus) return

  const actor = req.user as User | undefined
  await appendOrderStatusEvent({
    payload: req.payload,
    req,
    orderId: Number(doc.id),
    companyId:
      typeof doc.company === 'object' ? Number((doc.company as { id: number }).id) : Number(doc.company),
    fromStatus: prevStatus,
    toStatus: nextStatus,
    actorId: actor?.id ?? null,
  })
}

export const orderStaffBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const rows = await req.payload.find({
    collection: 'order-events',
    where: { order: { equals: id } },
    limit: 500,
    overrideAccess: true,
  })
  for (const row of rows.docs) {
    await req.payload.delete({
      collection: 'order-events',
      id: row.id,
      overrideAccess: true,
    })
  }
}
