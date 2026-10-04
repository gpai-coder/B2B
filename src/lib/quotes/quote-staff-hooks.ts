import type {
  CollectionAfterErrorHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { APIError } from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from '@/access'
import {
  createQuoteWithUniqueNumber,
  QUOTE_CREATE_NESTED,
  QUOTE_CREATE_OVERRIDE_ACCESS,
  QUOTE_CREATE_PENDING_DATA,
} from '@/lib/quotes/create-quote-with-retry'
import { isQuoteNumberCollision } from '@/lib/quotes/allocate-quote-number'
import { allocateQuoteNumber } from '@/lib/quotes/allocate-quote-number'
import { emptyEquivalent } from '@/lib/orders/order-frozen-compare'
import {
  assertDraftLinePricesPresent,
  enrichDraftLinePrices,
  prepareQuoteDraftData,
} from '@/lib/quotes/quote-prepare'
import {
  assertDraftQuoteLinesUnchangedSinceClientSnapshot,
  assertFrozenQuoteFieldsUnchanged,
  assertValidQuoteStatusTransition,
  lockAndLoadQuoteForUpdate,
  QUOTE_CLIENT_STATUS,
  QuoteTransitionConflictError,
  QuoteWorkflowError,
  QuoteWorkflowTransactionError,
  peekQuoteClientStatus,
  setQuoteClientLines,
  setQuoteClientStatus,
  setQuoteTransitionFromStatus,
  takeQuoteClientLines,
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

function isDraftOperation(
  operation: string,
  data: Record<string, unknown>,
  originalDoc: Record<string, unknown> | null | undefined,
): boolean {
  if (operation === 'create') return true
  const status = data.status != null ? String(data.status) : String(originalDoc?.status ?? 'draft')
  return status === 'draft'
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

export const quoteStaffBeforeOperation: CollectionBeforeOperationHook = async ({
  operation,
  args,
  req,
  overrideAccess,
}) => {
  if (operation === 'create') {
    const ctx = req.context as Record<string, unknown>
    if (!ctx[QUOTE_CREATE_NESTED]) {
      ctx[QUOTE_CREATE_PENDING_DATA] = { ...(args.data as Record<string, unknown>) }
      ctx[QUOTE_CREATE_OVERRIDE_ACCESS] = overrideAccess ?? false
    }
    return args
  }

  if (operation !== 'update') return args
  const data = args.data as Record<string, unknown> | undefined
  if (!data) return args

  const user = req.user as User | undefined
  if (!overrideAccess && !isStaff(user)) {
    return args
  }

  const ctx = req.context as Record<string, unknown>
  if (ctx[QUOTE_CLIENT_STATUS] == null) {
    try {
      const lockedDocs = await loadQuotesForUpdateOperation(req, args as Record<string, unknown>)
      for (const locked of lockedDocs) {
        setQuoteClientStatus(req, String(locked.status ?? 'draft'))
        setQuoteClientLines(req, locked.lines)
      }
    } catch (err) {
      rethrowQuoteWorkflow(err)
    }
  }

  if (!updateTouchesFrozenFields(data)) return args

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

export const quoteStaffBeforeValidate: CollectionBeforeValidateHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  const user = req.user as User | undefined
  const ctx = req.context as Record<string, unknown>
  const overrideAccess = Boolean(ctx[QUOTE_CREATE_OVERRIDE_ACCESS])
  if (!overrideAccess && !isStaff(user)) {
    return data
  }

  const record = (data ?? {}) as Record<string, unknown>
  if (!isDraftOperation(operation, record, originalDoc as Record<string, unknown> | undefined)) {
    return data
  }

  const enriched = await enrichDraftLinePrices(req.payload, req, record)
  assertDraftLinePricesPresent(enriched)
  return enriched
}

export const quoteStaffBeforeChange: CollectionBeforeChangeHook = async (args) => {
  let data = (args.data ?? {}) as Record<string, unknown>
  const ctx = args.req.context as Record<string, unknown>

  if (args.operation === 'create') {
    if (ctx[QUOTE_CREATE_NESTED]) {
      return data
    }
    data = await prepareQuoteDraftData(args.req.payload, args.req, data)
    const incomingNumber = fieldPresent(data, 'quoteNumber') ? data.quoteNumber : null
    if (emptyEquivalent(incomingNumber, null) || String(incomingNumber ?? '').trim() === '') {
      data = { ...data, quoteNumber: await allocateQuoteNumber(args.req.payload, args.req) }
    }
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
      peekQuoteClientStatus(args.req) ?? String(args.originalDoc?.status ?? 'draft')
    ) as QuoteStatus

    if (fieldPresent(data, 'status') && data.status != null) {
      const requested = String(data.status) as QuoteStatus
      if (requested === lockedStatus && requested !== clientStatus) {
        throw new QuoteTransitionConflictError('Quote was updated concurrently; refresh and retry.')
      }
    }

    if (clientStatus !== lockedStatus) {
      throw new QuoteTransitionConflictError('Quote was updated concurrently; refresh and retry.')
    }

    const clientLines = takeQuoteClientLines(args.req)
    if (lockedStatus === 'draft' && clientStatus === 'draft') {
      assertDraftQuoteLinesUnchangedSinceClientSnapshot(locked, clientLines)
    }

    const stashed = takeFrozenOperationStash(args.req, Number(args.originalDoc.id))
    if (stashed) {
      assertFrozenQuoteFieldsUnchanged(locked, stashed)
    }

    if (lockedStatus === 'draft') {
      data = await enrichDraftLinePrices(args.req.payload, args.req, data)
      assertDraftLinePricesPresent(data)
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

export const quoteStaffAfterError: CollectionAfterErrorHook = async ({
  error,
  req,
  collection,
  context,
}) => {
  if (collection.slug !== 'quotes') return
  if (!isQuoteNumberCollision(error)) return
  if (context[QUOTE_CREATE_NESTED]) return

  const pending = context[QUOTE_CREATE_PENDING_DATA] as Record<string, unknown> | undefined
  if (!pending) return

  const overrideAccess = Boolean(context[QUOTE_CREATE_OVERRIDE_ACCESS])
  const doc = await createQuoteWithUniqueNumber(req.payload, req, pending, { overrideAccess })
  delete context[QUOTE_CREATE_PENDING_DATA]

  return {
    status: 201,
    response: {
      message: 'Quote created successfully.',
      doc,
    },
  }
}
