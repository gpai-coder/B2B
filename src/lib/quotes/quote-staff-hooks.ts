import type {
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
} from 'payload'
import { APIError } from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from '@/access'
import { emptyEquivalent } from '@/lib/orders/order-frozen-compare'
import { resolveUnitPriceForCompany } from '@/lib/pricing/resolve-unit-price'
import {
  allocateQuoteNumber,
  isQuoteNumberCollision,
} from '@/lib/quotes/allocate-quote-number'
import { runBoundedUniqueRetry } from '@/lib/db/bounded-unique-retry'
import {
  assertFrozenQuoteFieldsUnchanged,
  assertValidQuoteStatusTransition,
  defaultQuoteExpiresAt,
  lockAndLoadQuoteForUpdate,
  QuoteFrozenFieldError,
  QuoteTransitionConflictError,
  QuoteWorkflowError,
  QuoteWorkflowTransactionError,
  setQuoteTransitionFromStatus,
  takeQuoteClientStatus,
  type QuoteStatus,
} from '@/lib/quotes/quote-workflow'

const QUOTE_FROZEN_OPERATION_STASH = 'quoteFrozenOperationStash'

const FROZEN_FIELD_KEYS = ['company', 'lines', 'expiresAt', 'quoteNumber'] as const

function fieldPresent(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key)
}

function pickFrozenFields(data: Record<string, unknown>): Record<string, unknown> {
  const slice: Record<string, unknown> = {}
  for (const key of FROZEN_FIELD_KEYS) {
    if (fieldPresent(data, key)) slice[key] = data[key]
  }
  return slice
}

function updateTouchesFrozenFields(data: Record<string, unknown>): boolean {
  return FROZEN_FIELD_KEYS.some((key) => fieldPresent(data, key))
}

function rethrowQuoteWorkflow(err: unknown): never {
  if (err instanceof QuoteWorkflowError) {
    throw new APIError(err.message, err.status)
  }
  throw err
}

function stashFrozenOperationData(
  req: Parameters<CollectionBeforeOperationHook>[0]['req'],
  quoteId: number,
  data: Record<string, unknown>,
): void {
  const slice = pickFrozenFields(data)
  if (Object.keys(slice).length === 0) return
  const ctx = req.context as Record<string, unknown>
  let map = ctx[QUOTE_FROZEN_OPERATION_STASH] as Map<number, Record<string, unknown>> | undefined
  if (!map) {
    map = new Map()
    ctx[QUOTE_FROZEN_OPERATION_STASH] = map
  }
  map.set(quoteId, slice)
}

function takeFrozenOperationStash(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  quoteId: number,
): Record<string, unknown> | undefined {
  const ctx = req.context as Record<string, unknown>
  const map = ctx[QUOTE_FROZEN_OPERATION_STASH] as Map<number, Record<string, unknown>> | undefined
  if (!map) return undefined
  const slice = map.get(quoteId)
  map.delete(quoteId)
  return slice
}

async function loadQuotesForUpdateOperation(
  req: Parameters<CollectionBeforeOperationHook>[0]['req'],
  args: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  if ('id' in args && args.id != null) {
    const rawId = args.id
    const id = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null
    if (id == null) return []
    const doc = await req.payload.findByID({
      collection: 'quotes',
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!doc) return []
    return [doc as unknown as Record<string, unknown>]
  }

  if ('where' in args && args.where) {
    const found = await req.payload.find({
      collection: 'quotes',
      where: args.where as import('payload').Where,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    return found.docs as unknown as Array<Record<string, unknown>>
  }

  return []
}

async function enrichDraftLinePrices(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const companyRaw = data.company
  const companyId =
    typeof companyRaw === 'object' && companyRaw != null
      ? Number((companyRaw as { id: number }).id)
      : companyRaw != null
        ? Number(companyRaw)
        : null
  if (companyId == null || Number.isNaN(companyId)) return data
  const lines = data.lines
  if (!Array.isArray(lines) || lines.length === 0) return data

  const readOpts = { overrideAccess: true as const, req: req }
  const enriched = await Promise.all(
    lines.map(async (line) => {
      const row = line as Record<string, unknown>
      const variantRaw = row.variant
      const variantId =
        typeof variantRaw === 'object' && variantRaw != null
          ? Number((variantRaw as { id: number }).id)
          : variantRaw != null
            ? Number(variantRaw)
            : null
      const sku = String(row.sku ?? '')
      const quantity = Number(row.quantity ?? 1)
      if (row.unitPrice != null && row.unitPrice !== '' && !Number.isNaN(Number(row.unitPrice))) {
        return row
      }
      if (variantId == null || Number.isNaN(variantId) || !sku) return row
      const price = await resolveUnitPriceForCompany(
        req.payload,
        companyId,
        variantId,
        sku,
        quantity,
        readOpts,
      )
      if (!price) return row
      return { ...row, unitPrice: price.unitPrice }
    }),
  )
  return { ...data, lines: enriched }
}

export const quoteStaffBeforeOperation: CollectionBeforeOperationHook = async ({
  operation,
  args,
  req,
  overrideAccess,
}) => {
  if (operation !== 'update') return args
  const data = args.data as Record<string, unknown> | undefined
  if (!data || !updateTouchesFrozenFields(data)) return args

  const user = req.user as User | undefined
  if (!overrideAccess && !isStaff(user)) {
    return args
  }

  try {
    const lockedDocs = await loadQuotesForUpdateOperation(req, args as Record<string, unknown>)
    const clientStatus = takeQuoteClientStatus(req)
    if (clientStatus != null) {
      for (const locked of lockedDocs) {
        const lockedStatus = String(locked.status ?? 'draft')
        if (clientStatus !== lockedStatus) {
          throw new QuoteTransitionConflictError('Quote was updated concurrently; refresh and retry.')
        }
      }
    }
    for (const locked of lockedDocs) {
      const quoteId = Number(locked.id)
      assertFrozenQuoteFieldsUnchanged(locked, data)
      stashFrozenOperationData(req, quoteId, data)
    }
  } catch (err) {
    rethrowQuoteWorkflow(err)
  }

  return args
}

export const quoteStaffBeforeChange: CollectionBeforeChangeHook = async (args) => {
  let data = (args.data ?? {}) as Record<string, unknown>

  if (args.operation === 'create') {
    if (!fieldPresent(data, 'expiresAt') || emptyEquivalent(data.expiresAt, null)) {
      data = { ...data, expiresAt: defaultQuoteExpiresAt() }
    }
    const incomingNumber = fieldPresent(data, 'quoteNumber') ? data.quoteNumber : null
    if (emptyEquivalent(incomingNumber, null) || String(incomingNumber ?? '').trim() === '') {
      data = {
        ...data,
        quoteNumber: await runBoundedUniqueRetry(
          args.req.payload,
          args.req,
          () => allocateQuoteNumber(args.req.payload, args.req),
          { isCollision: isQuoteNumberCollision },
        ),
      }
    }
    data = await enrichDraftLinePrices(args.req, data)
    return data
  }

  if (!args.originalDoc?.id) return data

  try {
    const locked = await lockAndLoadQuoteForUpdate(
      args.req.payload,
      Number(args.originalDoc.id),
      args.req,
    )

    const lockedStatus = String(locked.status ?? 'draft') as QuoteStatus
    const nextStatus = (
      data.status != null ? String(data.status) : lockedStatus
    ) as QuoteStatus

    const clientStatus = (
      takeQuoteClientStatus(args.req) ?? String(args.originalDoc?.status ?? 'draft')
    ) as QuoteStatus
    if (clientStatus !== lockedStatus) {
      throw new QuoteTransitionConflictError('Quote was updated concurrently; refresh and retry.')
    }

    const stashed = takeFrozenOperationStash(args.req, Number(args.originalDoc.id))
    if (stashed) {
      assertFrozenQuoteFieldsUnchanged(locked, stashed)
    }

    if (lockedStatus === 'draft') {
      data = await enrichDraftLinePrices(args.req, data)
    }

    if (nextStatus !== lockedStatus) {
      if (nextStatus === 'withdrawn' || nextStatus === 'expired') {
        if (locked.convertedOrder != null && locked.convertedOrder !== '') {
          throw new QuoteTransitionConflictError('Quote already converted to an order.')
        }
      }
      assertValidQuoteStatusTransition(lockedStatus, nextStatus)
      setQuoteTransitionFromStatus(args.req, lockedStatus)
    }
  } catch (err) {
    if (err instanceof QuoteWorkflowTransactionError) {
      throw err
    }
    rethrowQuoteWorkflow(err)
  }

  return data
}
