import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { validatePoNumber } from '@/lib/checkout/validate-po'
import { allocateOrderNumberWithRetry, isOrderNumberCollision } from '@/lib/orders/allocate-order-number'

import type { CartMutationContext } from './cart-serialized'
import { isCartBusyCause, lockQuoteRow, rethrowCartMutationError } from './cart-serialized'
import { isUniqueViolation } from './db-errors'
import {
  assertValidCartQuantity,
  CartValidationError,
  loadVariantCartMeta,
  loadVariantForOrdering,
  unavailableReason,
} from './cart-helpers'
import type { CartLine, CommerceOrder, PriceQuote } from './types'

export type ShipToInput = {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

type CheckoutDeps = {
  payload: Payload
  actingUser: User
  companyId: string
  txReadOpts: (req?: PayloadRequest) => { overrideAccess: boolean; req?: PayloadRequest }
  resolveUnitPrice: (
    companyId: string,
    variantId: number,
    sku: string,
    quantity?: number,
    req?: PayloadRequest,
  ) => Promise<PriceQuote | null>
  persistCartLines: (
    cartId: number,
    lines: CartLine[],
    req: PayloadRequest,
  ) => Promise<CartLine[]>
  runCartMutation: (mutate: (ctx: CartMutationContext) => Promise<CartLine[]>) => Promise<CartLine[]>
  createReq: () => PayloadRequest
  mapOrder: (doc: Record<string, unknown>) => CommerceOrder
}

export { isOrderNumberCollision } from '@/lib/orders/allocate-order-number'

async function findOrderByCompanyIdempotency(
  deps: CheckoutDeps,
  idempotencyKey: string,
  req?: PayloadRequest,
): Promise<CommerceOrder | null> {
  const existing = await deps.payload.find({
    collection: 'orders',
    where: {
      and: [
        { company: { equals: Number(deps.companyId) } },
        { idempotencyKey: { equals: idempotencyKey } },
      ],
    },
    limit: 1,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  if (!existing.docs[0]) return null
  return deps.mapOrder(existing.docs[0] as unknown as Record<string, unknown>)
}

function assertQuoteEligible(
  quote: {
    company: unknown
    status: string
    expiresAt: string
    convertedOrder?: unknown
  },
  companyId: string,
): void {
  const quoteCompany =
    typeof quote.company === 'object' ? String((quote.company as { id: number }).id) : String(quote.company)
  if (quoteCompany !== companyId) {
    throw new Error('Quote not found')
  }
  if (quote.status !== 'accepted') {
    throw new Error('Quote not found')
  }
  const expires = new Date(String(quote.expiresAt))
  if (expires.getTime() < Date.now()) {
    throw new Error('Quote not found')
  }
}

async function handleCheckoutUniqueViolation(
  deps: CheckoutDeps,
  err: unknown,
  idempotencyKey: string,
  poNumber: string,
): Promise<CommerceOrder> {
  if (!isUniqueViolation(err)) {
    rethrowCartMutationError(err)
  }
  const replay = await findOrderByCompanyIdempotency(deps, idempotencyKey)
  if (replay) return replay
  const dupPo = await deps.payload.find({
    collection: 'orders',
    where: {
      and: [
        { company: { equals: Number(deps.companyId) } },
        { poNumber: { equals: poNumber } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (dupPo.docs[0]) {
    throw new CartValidationError('PO number is already used for this company.')
  }
  throw err
}

async function createSubmittedOrderDoc(
  deps: CheckoutDeps,
  req: PayloadRequest,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const orderNumber = await allocateOrderNumberWithRetry(deps.payload, req)
  const created = await deps.payload.create({
    collection: 'orders',
    data: { ...data, orderNumber } as never,
    req,
    overrideAccess: true,
  })
  return created as unknown as Record<string, unknown>
}

export async function submitCartCheckout(
  deps: CheckoutDeps,
  input: {
    poNumber: string
    shipTo: ShipToInput
    orderNotes?: string
    idempotencyKey: string
  },
): Promise<CommerceOrder> {
  const po = validatePoNumber(input.poNumber)
  if (!po.ok) throw new CartValidationError(po.error)
  const key = input.idempotencyKey.trim()
  if (!key) throw new Error('Idempotency key is required.')

  const replay = await findOrderByCompanyIdempotency(deps, key)
  if (replay) return replay

  let createdOrder: CommerceOrder | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    createdOrder = undefined
    try {
      await deps.runCartMutation(async ({ req, cartId, lines }) => {
        const replayInLock = await findOrderByCompanyIdempotency(deps, key, req)
        if (replayInLock) {
          createdOrder = replayInLock
          return lines
        }

        if (lines.length === 0) {
          throw new CartValidationError('Cart is empty.')
        }

        const enriched: Array<{
          sku: string
          variant: number
          quantity: number
          unitPrice: number
        }> = []

        for (const line of lines) {
          await loadVariantForOrdering(deps.payload, line.sku, deps.txReadOpts(req))
          const meta = await loadVariantCartMeta(deps.payload, line.sku, deps.txReadOpts(req))
          const blocked = unavailableReason(meta)
          if (blocked) throw new CartValidationError(blocked)
          assertValidCartQuantity(line.quantity, meta)
          const price = await deps.resolveUnitPrice(
            deps.companyId,
            meta.variantId,
            line.sku,
            line.quantity,
            req,
          )
          if (!price) throw new CartValidationError(`No price available for ${line.sku}.`)
          enriched.push({
            sku: line.sku,
            variant: meta.variantId,
            quantity: line.quantity,
            unitPrice: price.unitPrice.amount,
          })
        }

        const created = await createSubmittedOrderDoc(deps, req, {
          company: Number(deps.companyId),
          status: 'submitted',
          poNumber: po.poNumber,
          idempotencyKey: key,
          orderNotes: input.orderNotes?.trim() || undefined,
          shipTo: input.shipTo,
          lines: enriched,
        })

        await deps.persistCartLines(cartId, [], req)
        createdOrder = deps.mapOrder(created)
        return []
      })
      break
    } catch (err) {
      if (isOrderNumberCollision(err) && attempt < 2) continue
      return handleCheckoutUniqueViolation(deps, err, key, po.poNumber)
    }
  }

  if (!createdOrder) {
    throw new Error('Checkout did not produce an order.')
  }
  return createdOrder
}

export async function convertQuoteToOrder(
  deps: CheckoutDeps,
  input: {
    quoteId: string
    poNumber: string
    shipTo: ShipToInput
    orderNotes?: string
    idempotencyKey: string
  },
): Promise<CommerceOrder> {
  const po = validatePoNumber(input.poNumber)
  if (!po.ok) throw new CartValidationError(po.error)
  const key = input.idempotencyKey.trim()
  if (!key) throw new Error('Idempotency key is required.')

  const quote = await deps.payload.findByID({
    collection: 'quotes',
    id: input.quoteId,
    ...deps.txReadOpts(),
  })
  assertQuoteEligible(quote, deps.companyId)
  if (quote.convertedOrder) {
    const existingId =
      typeof quote.convertedOrder === 'object'
        ? String((quote.convertedOrder as { id: number }).id)
        : String(quote.convertedOrder)
    const order = await deps.payload.findByID({
      collection: 'orders',
      id: existingId,
      overrideAccess: true,
    })
    return deps.mapOrder(order as unknown as Record<string, unknown>)
  }

  const replay = await findOrderByCompanyIdempotency(deps, key)
  if (replay) return replay

  for (let attempt = 0; attempt < 5; attempt++) {
    const req = deps.createReq()
    let transactionID: string | number | null | undefined
    try {
      transactionID = await deps.payload.db.beginTransaction()
    } catch (err) {
      rethrowCartMutationError(err)
    }
    if (transactionID != null) req.transactionID = transactionID

    try {
      await lockQuoteRow(deps.payload, Number(input.quoteId), req)

      const freshQuote = await deps.payload.findByID({
        collection: 'quotes',
        id: input.quoteId,
        req,
        overrideAccess: true,
      })

      if (freshQuote.convertedOrder) {
        const existingId =
          typeof freshQuote.convertedOrder === 'object'
            ? String((freshQuote.convertedOrder as { id: number }).id)
            : String(freshQuote.convertedOrder)
        const order = await deps.payload.findByID({
          collection: 'orders',
          id: existingId,
          req,
          overrideAccess: true,
        })
        if (transactionID != null) {
          await deps.payload.db.commitTransaction(transactionID)
        }
        return deps.mapOrder(order as unknown as Record<string, unknown>)
      }

      assertQuoteEligible(freshQuote, deps.companyId)

      const lines = (freshQuote.lines ?? []).map((line) => ({
        sku: line.sku,
        variant: typeof line.variant === 'object' ? line.variant?.id : line.variant,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      }))
      const created = await createSubmittedOrderDoc(deps, req, {
        company: Number(deps.companyId),
        status: 'submitted',
        poNumber: po.poNumber,
        idempotencyKey: key,
        orderNotes: input.orderNotes?.trim() || undefined,
        quote: Number(input.quoteId),
        shipTo: input.shipTo,
        lines,
      })
      await deps.payload.update({
        collection: 'quotes',
        id: input.quoteId,
        data: { convertedOrder: Number(created.id) },
        req,
        overrideAccess: true,
      })
      if (transactionID != null) {
        await deps.payload.db.commitTransaction(transactionID)
      }
      return deps.mapOrder(created)
    } catch (err) {
      if (transactionID != null) {
        await deps.payload.db.rollbackTransaction(transactionID)
      }
      if ((isOrderNumberCollision(err) || isCartBusyCause(err)) && attempt < 4) continue

      const replayAfterErr = await findOrderByCompanyIdempotency(deps, key)
      if (replayAfterErr) return replayAfterErr

      const quoteAfterErr = await deps.payload.findByID({
        collection: 'quotes',
        id: input.quoteId,
        overrideAccess: true,
      })
      if (quoteAfterErr.convertedOrder) {
        const existingId =
          typeof quoteAfterErr.convertedOrder === 'object'
            ? String((quoteAfterErr.convertedOrder as { id: number }).id)
            : String(quoteAfterErr.convertedOrder)
        const order = await deps.payload.findByID({
          collection: 'orders',
          id: existingId,
          overrideAccess: true,
        })
        return deps.mapOrder(order as unknown as Record<string, unknown>)
      }

      return handleCheckoutUniqueViolation(deps, err, key, po.poNumber)
    }
  }

  const replayFinal = await findOrderByCompanyIdempotency(deps, key)
  if (replayFinal) return replayFinal

  throw new Error('Could not complete quote conversion.')
}
