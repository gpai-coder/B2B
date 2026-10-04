import type { Payload, PayloadRequest } from 'payload'

import { isCartBusyCause, lockQuoteRow } from '@/commerce/cart-serialized'
import { frozenTextEqual, linesSemanticallyEqual } from '@/lib/orders/order-frozen-compare'

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'expired',
  'withdrawn',
  'cancelled',
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const QUOTE_LOCKED_FROM_STATUS = 'quoteLockedFromStatus'
export const QUOTE_CLIENT_STATUS = 'quoteClientStatus'
export const QUOTE_CLIENT_LINES = 'quoteClientLines'

const ALLOWED: Record<string, readonly QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'expired', 'withdrawn'],
  accepted: ['expired', 'withdrawn'],
  expired: [],
  withdrawn: [],
  cancelled: [],
}

export class QuoteWorkflowError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'QuoteWorkflowError'
    this.status = status
  }
}

export class QuoteTransitionConflictError extends QuoteWorkflowError {
  constructor(message: string) {
    super(message, 409)
    this.name = 'QuoteTransitionConflictError'
  }
}

export class QuoteFrozenFieldError extends QuoteWorkflowError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'QuoteFrozenFieldError'
  }
}

export class QuoteWorkflowTransactionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuoteWorkflowTransactionError'
  }
}

export function assertValidQuoteStatusTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (from === to) return
  const allowed = ALLOWED[from] ?? []
  if (!allowed.includes(to)) {
    throw new QuoteTransitionConflictError(`Invalid quote status transition from ${from} to ${to}.`)
  }
}

export function isQuoteFrozenStatus(status: string): boolean {
  return status !== 'draft'
}

function fieldPresent(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key)
}

function expiresAtEqual(locked: unknown, next: unknown): boolean {
  if (next == null && locked == null) return true
  const dayKey = (v: unknown): string | null => {
    if (v == null || v === '') return null
    const d = new Date(String(v))
    if (Number.isNaN(d.getTime())) return String(v)
    return d.toISOString().slice(0, 10)
  }
  return dayKey(locked) === dayKey(next)
}

export function assertFrozenQuoteFieldsUnchanged(
  locked: Record<string, unknown>,
  data: Record<string, unknown>,
): void {
  const status = String(locked.status ?? 'draft')
  if (!isQuoteFrozenStatus(status)) return

  if (fieldPresent(data, 'company')) {
    const prev =
      typeof locked.company === 'object' ? (locked.company as { id: number }).id : locked.company
    const next = typeof data.company === 'object' ? (data.company as { id: number }).id : data.company
    if (Number(prev) !== Number(next)) {
      throw new QuoteFrozenFieldError('Quote company cannot change after send.')
    }
  }

  if (
    fieldPresent(data, 'lines') &&
    !linesSemanticallyEqual(locked.lines as Array<Record<string, unknown>>, data.lines)
  ) {
    throw new QuoteFrozenFieldError('Quote lines are frozen after send.')
  }

  if (fieldPresent(data, 'expiresAt') && !expiresAtEqual(locked.expiresAt, data.expiresAt)) {
    throw new QuoteFrozenFieldError('Quote expiry is frozen after send.')
  }

  if (fieldPresent(data, 'quoteNumber') && !frozenTextEqual(locked.quoteNumber, data.quoteNumber)) {
    throw new QuoteFrozenFieldError('Quote number is frozen after send.')
  }
}

export async function lockAndLoadQuoteForUpdate(
  payload: Payload,
  quoteId: number,
  req: PayloadRequest,
): Promise<Record<string, unknown>> {
  try {
    await lockQuoteRow(payload, quoteId, req)
  } catch (err) {
    if (isCartBusyCause(err)) {
      throw new QuoteTransitionConflictError('Quote was updated concurrently; refresh and retry.')
    }
    throw err
  }
  const doc = await payload.findByID({
    collection: 'quotes',
    id: quoteId,
    depth: 0,
    req,
    overrideAccess: true,
  })
  return doc as unknown as Record<string, unknown>
}

export function setQuoteTransitionFromStatus(req: PayloadRequest, fromStatus: string): void {
  req.context = {
    ...(req.context as Record<string, unknown>),
    [QUOTE_LOCKED_FROM_STATUS]: fromStatus,
  }
}

export function takeQuoteTransitionFromStatus(req: PayloadRequest): string | null {
  const ctx = req.context as Record<string, unknown> | undefined
  const raw = ctx?.[QUOTE_LOCKED_FROM_STATUS]
  if (ctx && QUOTE_LOCKED_FROM_STATUS in ctx) {
    delete ctx[QUOTE_LOCKED_FROM_STATUS]
  }
  return raw != null ? String(raw) : null
}

export function setQuoteClientStatus(req: PayloadRequest, status: string): void {
  req.context = {
    ...(req.context as Record<string, unknown>),
    [QUOTE_CLIENT_STATUS]: status,
  }
}

export function takeQuoteClientStatus(req: PayloadRequest): string | null {
  const ctx = req.context as Record<string, unknown> | undefined
  const raw = ctx?.[QUOTE_CLIENT_STATUS]
  if (ctx && QUOTE_CLIENT_STATUS in ctx) {
    delete ctx[QUOTE_CLIENT_STATUS]
  }
  return raw != null ? String(raw) : null
}

export function setQuoteClientLines(req: PayloadRequest, lines: unknown): void {
  req.context = {
    ...(req.context as Record<string, unknown>),
    [QUOTE_CLIENT_LINES]: lines,
  }
}

export function takeQuoteClientLines(req: PayloadRequest): unknown {
  const ctx = req.context as Record<string, unknown> | undefined
  const raw = ctx?.[QUOTE_CLIENT_LINES]
  if (ctx && QUOTE_CLIENT_LINES in ctx) {
    delete ctx[QUOTE_CLIENT_LINES]
  }
  return raw
}

export function assertDraftQuoteLinesUnchangedSinceClientSnapshot(
  locked: Record<string, unknown>,
  clientLines: unknown,
): void {
  if (clientLines == null) return
  if (!linesSemanticallyEqual(locked.lines as Array<Record<string, unknown>>, clientLines)) {
    throw new QuoteTransitionConflictError('Quote was updated concurrently; refresh and retry.')
  }
}

export const VENDOR_VISIBLE_QUOTE_STATUSES = ['sent', 'accepted', 'expired'] as const

export function defaultQuoteExpiresAt(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 30)
  return d.toISOString()
}
