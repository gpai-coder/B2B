import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'
import type { User } from '@/payload-types'
import {
  assertFrozenOrderFieldsUnchanged,
  assertValidStatusTransition,
  lockAndLoadOrderForUpdate,
  OrderTransitionConflictError,
  OrderWorkflowError,
  OrderWorkflowTransactionError,
  setOrderTransitionFromStatus,
  takeOrderTransitionFromStatus,
  setOrderClientStatus,
  takeOrderClientStatus,
  type OrderStatus,
} from '@/lib/orders/order-workflow'
import { appendOrderStatusEvent } from '@/lib/orders/order-events'

function fieldPresent(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key)
}

function rethrowOrderWorkflow(err: unknown): never {
  if (err instanceof OrderWorkflowError) {
    throw new APIError(err.message, err.status)
  }
  throw err
}

export const orderStaffBeforeChange: CollectionBeforeChangeHook = async (args) => {
  if (args.operation === 'create' || !args.originalDoc?.id) return args.data

  try {
    const locked = await lockAndLoadOrderForUpdate(
      args.req.payload,
      Number(args.originalDoc.id),
      args.req,
    )
    assertFrozenOrderFieldsUnchanged(locked, (args.data ?? {}) as Record<string, unknown>)

    const lockedStatus = String(locked.status ?? 'draft') as OrderStatus
    const nextStatus = (
      args.data?.status != null ? String(args.data.status) : lockedStatus
    ) as OrderStatus

    const clientStatus = (
      takeOrderClientStatus(args.req) ??
      String(args.originalDoc?.status ?? 'draft')
    ) as OrderStatus
    if (fieldPresent((args.data ?? {}) as Record<string, unknown>, 'status') && clientStatus !== lockedStatus) {
      throw new OrderTransitionConflictError('Order was updated concurrently; refresh and retry.')
    }

    if (nextStatus !== lockedStatus) {
      assertValidStatusTransition(lockedStatus, nextStatus)
      setOrderTransitionFromStatus(args.req, lockedStatus)
    }
  } catch (err) {
    if (err instanceof OrderWorkflowTransactionError) {
      throw err
    }
    rethrowOrderWorkflow(err)
  }

  return args.data
}

export const orderStaffAfterChange: CollectionAfterChangeHook = async ({ doc, req, previousDoc }) => {
  const nextStatus = doc.status ? String(doc.status) : null
  if (!nextStatus) return

  const fromStatus =
    takeOrderTransitionFromStatus(req) ??
    (previousDoc?.status ? String(previousDoc.status) : null)
  if (!fromStatus || fromStatus === nextStatus) return

  const actor = req.user as User | undefined
  await appendOrderStatusEvent({
    payload: req.payload,
    req,
    orderId: Number(doc.id),
    companyId:
      typeof doc.company === 'object' ? Number((doc.company as { id: number }).id) : Number(doc.company),
    fromStatus,
    toStatus: nextStatus,
    actorId: actor?.id ?? null,
  })
}

export const orderStaffBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const events = await req.payload.count({
    collection: 'order-events',
    where: { order: { equals: id } },
    overrideAccess: true,
  })
  if (events.totalDocs > 0) {
    throw new APIError('Orders with history cannot be deleted; cancel instead.', 409)
  }
}
