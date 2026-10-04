import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeOperationHook,
} from 'payload'
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

const FROZEN_FIELD_KEYS = ['company', 'lines', 'shipTo', 'poNumber', 'orderNumber'] as const

function updateTouchesFrozenFields(data: Record<string, unknown>): boolean {
  return FROZEN_FIELD_KEYS.some((key) => fieldPresent(data, key))
}

async function loadOrdersForUpdateOperation(
  req: Parameters<CollectionBeforeOperationHook>[0]['req'],
  args: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  if ('id' in args && args.id != null) {
    const rawId = args.id
    const id = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null
    if (id == null) return []
    const doc = await req.payload.findByID({
      collection: 'orders',
      id,
      depth: 0,
      overrideAccess: true,
    })
    return [doc as unknown as Record<string, unknown>]
  }

  if ('where' in args && args.where) {
    const found = await req.payload.find({
      collection: 'orders',
      where: args.where as import('payload').Where,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    return found.docs as unknown as Array<Record<string, unknown>>
  }

  return []
}

export const orderStaffBeforeOperation: CollectionBeforeOperationHook = async ({ operation, args, req }) => {
  if (operation !== 'update') return args
  const data = args.data as Record<string, unknown> | undefined
  if (!data || !updateTouchesFrozenFields(data)) return args

  try {
    const lockedDocs = await loadOrdersForUpdateOperation(req, args as Record<string, unknown>)
    const clientStatus = takeOrderClientStatus(req)
    if (clientStatus != null) {
      for (const locked of lockedDocs) {
        const lockedStatus = String(locked.status ?? 'draft')
        if (clientStatus !== lockedStatus) {
          throw new OrderTransitionConflictError('Order was updated concurrently; refresh and retry.')
        }
      }
    }
    for (const locked of lockedDocs) {
      assertFrozenOrderFieldsUnchanged(locked, data)
    }
  } catch (err) {
    rethrowOrderWorkflow(err)
  }

  return args
}

export const orderStaffBeforeChange: CollectionBeforeChangeHook = async (args) => {
  if (args.operation === 'create' || !args.originalDoc?.id) return args.data

  try {
    const locked = await lockAndLoadOrderForUpdate(
      args.req.payload,
      Number(args.originalDoc.id),
      args.req,
    )

    const lockedStatus = String(locked.status ?? 'draft') as OrderStatus
    const nextStatus = (
      args.data?.status != null ? String(args.data.status) : lockedStatus
    ) as OrderStatus

    const clientStatus = (
      takeOrderClientStatus(args.req) ??
      String(args.originalDoc?.status ?? 'draft')
    ) as OrderStatus
    if (clientStatus !== lockedStatus) {
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
