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

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['submitted'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export class OrderWorkflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrderWorkflowError'
  }
}

export function assertValidStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return
  const allowed = ALLOWED[from] ?? []
  if (!allowed.includes(to)) {
    throw new OrderWorkflowError(`Invalid order status transition from ${from} to ${to}.`)
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
    throw new Error(`Missing transaction session for order lock (${String(txId)})`)
  }
  return sessionDb
}

export async function lockOrderRow(payload: Payload, orderId: number, req: PayloadRequest): Promise<void> {
  const txId = await resolveTransactionId(req)
  if (txId == null) throw new Error('Order workflow requires an active transaction.')
  const drizzle = drizzleForTransaction(payload, txId)
  await payload.db.execute({
    drizzle,
    sql: sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
  })
}

export async function lockOrderRowIfInTransaction(
  payload: Payload,
  orderId: number,
  req: PayloadRequest,
): Promise<void> {
  const txId = await resolveTransactionId(req)
  if (txId == null) return
  await lockOrderRow(payload, orderId, req)
}

function linesEqual(
  a: Array<Record<string, unknown>> | undefined,
  b: Array<Record<string, unknown>> | undefined,
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}

function shipToEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

export function assertFrozenOrderFieldsUnchanged(
  original: Record<string, unknown>,
  data: Record<string, unknown>,
): void {
  const status = String(original.status ?? 'draft')
  if (!isFrozenStatus(status)) return

  if (data.company != null) {
    const prev = typeof original.company === 'object' ? (original.company as { id: number }).id : original.company
    const next = typeof data.company === 'object' ? (data.company as { id: number }).id : data.company
    if (Number(prev) !== Number(next)) {
      throw new OrderWorkflowError('Order company cannot change after submit.')
    }
  }

  if (data.lines != null && !linesEqual(original.lines as Array<Record<string, unknown>>, data.lines as Array<Record<string, unknown>>)) {
    throw new OrderWorkflowError('Order lines are frozen after submit.')
  }

  if (data.shipTo != null && !shipToEqual(original.shipTo as Record<string, unknown>, data.shipTo as Record<string, unknown>)) {
    throw new OrderWorkflowError('Ship-to is frozen after submit.')
  }

  if (data.poNumber != null && String(data.poNumber) !== String(original.poNumber ?? '')) {
    throw new OrderWorkflowError('PO number is frozen after submit.')
  }
}
