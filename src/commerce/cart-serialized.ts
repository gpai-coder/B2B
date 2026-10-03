import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { createPayloadReq } from '@/lib/payload-req'

import type { CartLine } from './types'

export class CartBusyError extends Error {
  constructor() {
    super('Cart is busy, try again')
    this.name = 'CartBusyError'
  }
}

export type CartMutationContext = {
  req: PayloadRequest
  cartId: number
  lines: CartLine[]
}

async function resolveTransactionId(req: PayloadRequest): Promise<string | number | null | undefined> {
  let id = req.transactionID
  if (id instanceof Promise) {
    id = await id
  }
  return id
}

function drizzleForTransaction(payload: Payload, txId: string | number) {
  const sessions = (payload.db as { sessions?: Record<string, { db?: typeof payload.db.drizzle }> }).sessions
  const sessionDb = sessions?.[String(txId)]?.db
  if (!sessionDb) {
    throw new Error(`Missing transaction session for cart lock (${String(txId)})`)
  }
  return sessionDb
}

function isCartBusyCause(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const record = err as Record<string, unknown>
  const code = record.code ?? (record.cause as Record<string, unknown> | undefined)?.code
  if (code === '55P03' || code === '57014') return true
  const message = String(record.message ?? '')
  if (/lock timeout|canceling statement due to lock timeout/i.test(message)) return true
  if (/timeout exceeded when trying to connect|connection timeout/i.test(message)) return true
  return false
}

export function rethrowCartMutationError(err: unknown): never {
  if (isCartBusyCause(err)) {
    throw new CartBusyError()
  }
  throw err
}

async function setTransactionLockTimeout(payload: Payload, txId: string | number): Promise<void> {
  const drizzle = drizzleForTransaction(payload, txId)
  await payload.db.execute({
    drizzle,
    sql: sql`SET LOCAL lock_timeout = '5s'`,
  })
}

export async function lockCartRow(payload: Payload, cartId: number, req: PayloadRequest): Promise<void> {
  const txId = await resolveTransactionId(req)
  if (txId == null) {
    throw new Error('Cart lock requires an active transaction.')
  }
  await setTransactionLockTimeout(payload, txId)
  const drizzle = drizzleForTransaction(payload, txId)
  await payload.db.execute({
    drizzle,
    sql: sql`SELECT id FROM carts WHERE id = ${cartId} FOR UPDATE`,
  })
}

type RunCartMutationParams = {
  payload: Payload
  actingUser: User
  companyId: string
  getOrCreateCartDoc: (companyId: string, req?: PayloadRequest) => Promise<{ id: number }>
  mutate: (ctx: CartMutationContext) => Promise<CartLine[]>
}

/** Runs a cart write inside a DB transaction with the cart row locked (FOR UPDATE). */
export async function runCartMutation(params: RunCartMutationParams): Promise<CartLine[]> {
  const { payload, actingUser, companyId, getOrCreateCartDoc, mutate } = params
  const cart = await getOrCreateCartDoc(companyId)
  const req = createPayloadReq(payload, actingUser)
  const transactionID = await payload.db.beginTransaction()
  if (transactionID != null) {
    req.transactionID = transactionID
  }

  try {
    await lockCartRow(payload, cart.id, req)
    const fresh = await payload.findByID({
      collection: 'carts',
      id: cart.id,
      req,
      overrideAccess: true,
    })
    const lines = (fresh.lines ?? []).map((line) => ({
      sku: line.sku,
      quantity: Number(line.quantity),
    }))
    const result = await mutate({ req, cartId: cart.id, lines })
    if (transactionID != null) {
      await payload.db.commitTransaction(transactionID)
    }
    return result
  } catch (err) {
    if (transactionID != null) {
      await payload.db.rollbackTransaction(transactionID)
    }
    rethrowCartMutationError(err)
  }
}
