import type { Payload, PayloadRequest } from 'payload'

import { isUniqueViolation } from '@/commerce/db-errors'

export function isOrderNumberCollision(err: unknown): boolean {
  if (!isUniqueViolation(err)) return false
  const record = err as Record<string, unknown>
  const data = record.data
  if (data && typeof data === 'object') {
    const errors = (data as { errors?: Array<{ path?: string }> }).errors
    if (errors?.some((e) => e.path === 'orderNumber')) return true
  }
  const cause = record.cause
  if (cause && typeof cause === 'object') {
    const constraint = (cause as Record<string, unknown>).constraint
    if (constraint === 'orders_order_number_idx') return true
  }
  return false
}

/** Collision-safe order number allocation (same algorithm as checkout). */
export async function allocateOrderNumber(payload: Payload, req: PayloadRequest): Promise<string> {
  const year = new Date().getFullYear()
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = `ORD-${year}-${String(Math.floor(Math.random() * 900000) + 100000)}`
    const existing = await payload.find({
      collection: 'orders',
      where: { orderNumber: { equals: candidate } },
      limit: 1,
      overrideAccess: true,
      req,
    })
    if (!existing.docs[0]) return candidate
  }
  throw new Error('Could not allocate order number.')
}
