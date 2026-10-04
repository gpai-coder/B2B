import type { Payload, PayloadRequest } from 'payload'

import { isUniqueViolation } from '@/commerce/db-errors'
import { runBoundedUniqueRetry } from '@/lib/db/bounded-unique-retry'

export function isQuoteNumberCollision(err: unknown): boolean {
  if (!isUniqueViolation(err)) return false
  const record = err as Record<string, unknown>
  const data = record.data
  if (data && typeof data === 'object') {
    const errors = (data as { errors?: Array<{ path?: string }> }).errors
    if (errors?.some((e) => e.path === 'quoteNumber')) return true
  }
  const cause = record.cause
  if (cause && typeof cause === 'object') {
    const constraint = (cause as Record<string, unknown>).constraint
    if (constraint === 'quotes_quote_number_idx') return true
  }
  return false
}

async function pickUnusedQuoteNumber(payload: Payload, req: PayloadRequest): Promise<string> {
  const year = new Date().getFullYear()
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = `Q-${year}-${String(Math.floor(Math.random() * 900000) + 100000)}`
    const existing = await payload.find({
      collection: 'quotes',
      where: { quoteNumber: { equals: candidate } },
      limit: 1,
      overrideAccess: true,
      req,
    })
    if (!existing.docs[0]) return candidate
  }
  throw new Error('Could not allocate quote number.')
}

/** Collision-safe quote number (probe + bounded retry when persisting). */
export async function allocateQuoteNumber(payload: Payload, req: PayloadRequest): Promise<string> {
  return pickUnusedQuoteNumber(payload, req)
}

export async function allocateQuoteNumberWithRetry(
  payload: Payload,
  req: PayloadRequest,
): Promise<string> {
  return runBoundedUniqueRetry(
    payload,
    req,
    () => pickUnusedQuoteNumber(payload, req),
    { isCollision: isQuoteNumberCollision },
  )
}
