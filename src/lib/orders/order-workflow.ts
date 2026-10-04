import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

export const ORDER_STATUSES = [
  'draft',
  'submitted',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_LOCKED_FROM_STATUS = 'orderLockedFromStatus'
export const ORDER_CLIENT_STATUS = 'orderClientStatus'

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['submitted'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export class OrderWorkflowError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'OrderWorkflowError'
    this.status = status
  }
}

export class OrderTransitionConflictError extends OrderWorkflowError {
  constructor(message: string) {
    super(message, 409)
    this.name = 'OrderTransitionConflictError'
  }
}

export class OrderFrozenFieldError extends OrderWorkflowError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'OrderFrozenFieldError'
  }
}

export class OrderWorkflowTransactionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrderWorkflowTransactionError'
  }
}

export function assertValidStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return
  const allowed = ALLOWED[from] ?? []
  if (!allowed.includes(to)) {
    throw new OrderTransitionConflictError(`Invalid order status transition from ${from} to ${to}.`)
  }
}

export function isFrozenStatus(status: string): boolean {
  return status !== 'draft'
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
    throw new OrderWorkflowTransactionError(`Missing transaction session for order lock (${String(txId)})`)
  }
  return sessionDb
}

async function setOrderLockTimeout(payload: Payload, txId: string | number): Promise<void> {
  const drizzle = drizzleForTransaction(payload, txId)
  await payload.db.execute({
    drizzle,
    sql: sql`SET LOCAL lock_timeout = '5s'`,
  })
}

import {
  frozenTextEqual,
  linesSemanticallyEqual,
  shipToSemanticallyEqual,
} from '@/lib/orders/order-frozen-compare'

/** Namespace for pg_advisory_xact_lock(int, int) on order rows. */
export const ORDER_ADVISORY_LOCK_CLASS = 2_026_100_401

function fieldPresent(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key)
}

export function assertFrozenOrderFieldsUnchanged(
  locked: Record<string, unknown>,
  data: Record<string, unknown>,
): void {
  const status = String(locked.status ?? 'draft')
  if (!isFrozenStatus(status)) return

  if (fieldPresent(data, 'company')) {
    const prev =
      typeof locked.company === 'object' ? (locked.company as { id: number }).id : locked.company
    const next = typeof data.company === 'object' ? (data.company as { id: number }).id : data.company
    if (Number(prev) !== Number(next)) {
      throw new OrderFrozenFieldError('Order company cannot change after submit.')
    }
  }

  if (fieldPresent(data, 'lines') && !linesSemanticallyEqual(locked.lines as Array<Record<string, unknown>>, data.lines)) {
    throw new OrderFrozenFieldError('Order lines are frozen after submit.')
  }

  if (fieldPresent(data, 'shipTo')) {
    if (data.shipTo === null) {
      throw new OrderFrozenFieldError('Ship-to is frozen after submit.')
    }
    if (!shipToSemanticallyEqual(locked.shipTo as Record<string, unknown>, data.shipTo)) {
      throw new OrderFrozenFieldError('Ship-to is frozen after submit.')
    }
  }

  if (fieldPresent(data, 'poNumber') && !frozenTextEqual(locked.poNumber, data.poNumber)) {
    throw new OrderFrozenFieldError('PO number is frozen after submit.')
  }

  if (fieldPresent(data, 'orderNumber') && !frozenTextEqual(locked.orderNumber, data.orderNumber)) {
    throw new OrderFrozenFieldError('Order number is frozen after submit.')
  }
}

export async function lockAndLoadOrderForUpdate(
  payload: Payload,
  orderId: number,
  req: PayloadRequest,
): Promise<Record<string, unknown>> {
  const txId = await resolveTransactionId(req)
  if (txId == null) {
    throw new OrderWorkflowTransactionError('Order workflow requires an active transaction.')
  }
  await setOrderLockTimeout(payload, txId)
  const drizzle = drizzleForTransaction(payload, txId)
  await payload.db.execute({
    drizzle,
    sql: sql`SELECT pg_advisory_xact_lock(${ORDER_ADVISORY_LOCK_CLASS}, ${orderId})`,
  })
  await payload.db.execute({
    drizzle,
    sql: sql`SELECT id, status, company_id, po_number, order_number FROM orders WHERE id = ${orderId} FOR UPDATE`,
  })
  const doc = await payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 0,
    req,
    overrideAccess: true,
  })
  return doc as unknown as Record<string, unknown>
}

export function setOrderTransitionFromStatus(req: PayloadRequest, fromStatus: string): void {
  req.context = {
    ...(req.context as Record<string, unknown>),
    [ORDER_LOCKED_FROM_STATUS]: fromStatus,
  }
}

export function takeOrderTransitionFromStatus(req: PayloadRequest): string | null {
  const ctx = req.context as Record<string, unknown> | undefined
  const raw = ctx?.[ORDER_LOCKED_FROM_STATUS]
  if (ctx && ORDER_LOCKED_FROM_STATUS in ctx) {
    delete ctx[ORDER_LOCKED_FROM_STATUS]
  }
  return raw != null ? String(raw) : null
}

export function setOrderClientStatus(req: PayloadRequest, status: string): void {
  req.context = {
    ...(req.context as Record<string, unknown>),
    [ORDER_CLIENT_STATUS]: status,
  }
}

export function takeOrderClientStatus(req: PayloadRequest): string | null {
  const ctx = req.context as Record<string, unknown> | undefined
  const raw = ctx?.[ORDER_CLIENT_STATUS]
  if (ctx && ORDER_CLIENT_STATUS in ctx) {
    delete ctx[ORDER_CLIENT_STATUS]
  }
  return raw != null ? String(raw) : null
}
