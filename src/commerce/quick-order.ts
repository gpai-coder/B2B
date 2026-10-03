import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { parseCartQuantity } from '@/lib/cart/quantity-rules'
import { mergeQuickOrderLines } from '@/lib/quick-order/parse-input'

import { isUniqueViolation } from './db-errors'
import {
  assertValidCartQuantity,
  CartValidationError,
  loadVariantCartMeta,
} from './cart-helpers'
import type {
  CartLine,
  PriceQuote,
  QuickOrderApplyResult,
  QuickOrderPreview,
  QuickOrderPreviewLine,
} from './types'

const UNKNOWN_SKU = 'Unknown SKU.'

export type QuickOrderDeps = {
  payload: Payload
  actingUser: User
  companyId: string
  readOpts: () => { overrideAccess: boolean; req?: PayloadRequest }
  resolveUnitPrice: (
    companyId: string,
    variantId: number,
    sku: string,
    quantity?: number,
  ) => Promise<PriceQuote | null>
  getCartLines: (companyId: string) => Promise<CartLine[]>
  getOrCreateCartDoc: (companyId: string, req: PayloadRequest) => Promise<{ id: number }>
  persistCartLines: (cartId: number, lines: CartLine[], req: PayloadRequest) => Promise<CartLine[]>
  createReq: () => PayloadRequest
}

async function validateQuickOrderLine(
  deps: QuickOrderDeps,
  line: { lineNumber: number; sku: string; quantity: number },
): Promise<QuickOrderPreviewLine> {
  const base = { lineNumber: line.lineNumber, sku: line.sku, quantity: line.quantity, ok: false as const }
  const qtyCheck = parseCartQuantity(line.quantity)
  if (!qtyCheck.ok) {
    return { ...base, error: qtyCheck.error }
  }

  let meta
  try {
    meta = await loadVariantCartMeta(deps.payload, line.sku, deps.readOpts())
  } catch {
    return { ...base, error: UNKNOWN_SKU }
  }
  if (meta.catalogHidden) {
    return { ...base, error: UNKNOWN_SKU }
  }

  const price = await deps.resolveUnitPrice(deps.companyId, meta.variantId, line.sku, qtyCheck.quantity)
  if (!price) {
    return { ...base, error: UNKNOWN_SKU }
  }

  if (meta.discontinued) {
    return { ...base, error: 'This finish is discontinued and cannot be ordered.' }
  }
  try {
    assertValidCartQuantity(qtyCheck.quantity, meta)
  } catch (err) {
    const message = err instanceof CartValidationError ? err.message : 'Invalid quantity.'
    return { ...base, error: message }
  }

  return {
    lineNumber: line.lineNumber,
    sku: line.sku,
    quantity: qtyCheck.quantity,
    ok: true,
    productName: meta.productName,
    unitPrice: price.unitPrice,
    source: price.source,
  }
}

export async function previewQuickOrderLines(
  deps: QuickOrderDeps,
  rawLines: Array<{ lineNumber: number; sku: string; quantity: number }>,
): Promise<QuickOrderPreview> {
  const merged = mergeQuickOrderLines(rawLines)
  const lines: QuickOrderPreviewLine[] = []
  for (const line of merged) {
    lines.push(await validateQuickOrderLine(deps, line))
  }
  return { lines }
}

async function loadExistingBulkAdd(deps: QuickOrderDeps, key: string) {
  const existing = await deps.payload.find({
    collection: 'cart-bulk-adds',
    where: {
      and: [
        { user: { equals: deps.actingUser.id } },
        { company: { equals: Number(deps.companyId) } },
        { idempotencyKey: { equals: key } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  return existing.docs[0] ?? null
}

export async function applyQuickOrderLines(
  deps: QuickOrderDeps,
  rawLines: Array<{ lineNumber: number; sku: string; quantity: number }>,
  idempotencyKey: string,
): Promise<QuickOrderApplyResult> {
  const key = idempotencyKey.trim()
  if (!key || key.length > 128) {
    throw new Error('Idempotency key is required (max 128 characters).')
  }

  const prior = await loadExistingBulkAdd(deps, key)
  if (prior) {
    const addedSkus = (prior.addedSkus as string[] | null) ?? []
    return { replay: true, addedSkus }
  }

  const preview = await previewQuickOrderLines(deps, rawLines)
  const valid = preview.lines.filter((l) => l.ok)
  const cart = await deps.getCartLines(deps.companyId)
  const merged = new Map(cart.map((line) => [line.sku, line.quantity]))
  const addedSkus: string[] = []

  for (const line of valid) {
    const current = merged.get(line.sku) ?? 0
    const nextQty = current + line.quantity
    const parsed = parseCartQuantity(nextQty)
    if (!parsed.ok) {
      throw new CartValidationError(parsed.error)
    }
    const meta = await loadVariantCartMeta(deps.payload, line.sku, deps.readOpts())
    assertValidCartQuantity(parsed.quantity, meta)
    merged.set(line.sku, parsed.quantity)
    addedSkus.push(line.sku)
  }

  const finalLines: CartLine[] = [...merged.entries()].map(([sku, quantity]) => ({ sku, quantity }))

  const req = deps.createReq()
  const transactionID = await deps.payload.db.beginTransaction()
  if (transactionID != null) {
    req.transactionID = transactionID
  }

  try {
    await deps.payload.create({
      collection: 'cart-bulk-adds',
      data: {
        user: deps.actingUser.id,
        company: Number(deps.companyId),
        idempotencyKey: key,
        addedSkus,
      },
      req,
      overrideAccess: true,
    })

    const cartDoc = await deps.getOrCreateCartDoc(deps.companyId, req)
    await deps.persistCartLines(cartDoc.id, finalLines, req)

    if (transactionID != null) {
      await deps.payload.db.commitTransaction(transactionID)
    }
    return { replay: false, addedSkus }
  } catch (err) {
    if (transactionID != null) {
      await deps.payload.db.rollbackTransaction(transactionID)
    }
    if (isUniqueViolation(err)) {
      const row = await loadExistingBulkAdd(deps, key)
      if (row) {
        return { replay: true, addedSkus: (row.addedSkus as string[] | null) ?? [] }
      }
    }
    throw err
  }
}
