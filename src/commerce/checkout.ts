import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { validatePoNumber } from '@/lib/checkout/validate-po'

import type { CartMutationContext } from './cart-serialized'
import { rethrowCartMutationError } from './cart-serialized'
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

async function allocateOrderNumber(payload: Payload, req: PayloadRequest): Promise<string> {
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

async function findOrderByCompanyIdempotency(
  deps: CheckoutDeps,
  idempotencyKey: string,
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
  })
  if (!existing.docs[0]) return null
  return deps.mapOrder(existing.docs[0] as unknown as Record<string, unknown>)
}

async function handleCheckoutUniqueViolation(
  deps: CheckoutDeps,
  err: unknown,
  idempotencyKey: string,
  poNumber: string,
): Promise<CommerceOrder> {
  if (!isUniqueViolation(err)) throw err
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
  try {
    await deps.runCartMutation(async ({ req, cartId, lines }) => {
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
        )
        if (!price) throw new CartValidationError(`No price available for ${line.sku}.`)
        enriched.push({
          sku: line.sku,
          variant: meta.variantId,
          quantity: line.quantity,
          unitPrice: price.unitPrice.amount,
        })
      }

      const orderNumber = await allocateOrderNumber(deps.payload, req)
      const created = await deps.payload.create({
        collection: 'orders',
        data: {
          company: Number(deps.companyId),
          status: 'submitted',
          orderNumber,
          poNumber: po.poNumber,
          idempotencyKey: key,
          orderNotes: input.orderNotes?.trim() || undefined,
          shipTo: input.shipTo,
          lines: enriched,
        },
        req,
        overrideAccess: true,
      })

      await deps.persistCartLines(cartId, [], req)
      createdOrder = deps.mapOrder(created as unknown as Record<string, unknown>)
      return []
    })
  } catch (err) {
    return handleCheckoutUniqueViolation(deps, err, key, po.poNumber)
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
  const quoteCompany =
    typeof quote.company === 'object' ? String((quote.company as { id: number }).id) : String(quote.company)
  if (quoteCompany !== deps.companyId) {
    throw new Error('Quote not found')
  }
  if (quote.status !== 'accepted') {
    throw new Error('Quote not found')
  }
  const expires = new Date(String(quote.expiresAt))
  if (expires.getTime() < Date.now()) {
    throw new Error('Quote not found')
  }
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

  const req = deps.createReq()
  let transactionID: string | number | null | undefined
  try {
    transactionID = await deps.payload.db.beginTransaction()
  } catch (err) {
    rethrowCartMutationError(err)
  }
  if (transactionID != null) req.transactionID = transactionID

  try {
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

    const orderNumber = await allocateOrderNumber(deps.payload, req)
    const lines = (freshQuote.lines ?? []).map((line) => ({
      sku: line.sku,
      variant: typeof line.variant === 'object' ? line.variant?.id : line.variant,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }))
    const created = await deps.payload.create({
      collection: 'orders',
      data: {
        company: Number(deps.companyId),
        status: 'submitted',
        orderNumber,
        poNumber: po.poNumber,
        idempotencyKey: key,
        orderNotes: input.orderNotes?.trim() || undefined,
        quote: Number(input.quoteId),
        shipTo: input.shipTo,
        lines,
      },
      req,
      overrideAccess: true,
    })
    await deps.payload.update({
      collection: 'quotes',
      id: input.quoteId,
      data: { convertedOrder: created.id },
      req,
      overrideAccess: true,
    })
    if (transactionID != null) {
      await deps.payload.db.commitTransaction(transactionID)
    }
    return deps.mapOrder(created as unknown as Record<string, unknown>)
  } catch (err) {
    if (transactionID != null) {
      await deps.payload.db.rollbackTransaction(transactionID)
    }
    return handleCheckoutUniqueViolation(deps, err, key, po.poNumber)
  }
}
