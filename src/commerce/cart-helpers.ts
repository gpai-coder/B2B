import type { Payload } from 'payload'

import type { Product, ProductVariant } from '@/payload-types'
import { normalizeQuantityRules, validateOrderQuantity } from '@/lib/cart/quantity-rules'

export class CartValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CartValidationError'
  }
}

export type VariantCartMeta = {
  sku: string
  variantId: number
  productId: number
  productName: string
  catalogHidden: boolean
  discontinued: boolean
  moq: number
  orderMultiple: number
}

export type VariantOrderRules = VariantCartMeta

export async function loadVariantCartMeta(
  payload: Payload,
  sku: string,
  readOpts: { overrideAccess: boolean; req?: import('payload').PayloadRequest },
): Promise<VariantCartMeta> {
  const result = await payload.find({
    collection: 'product-variants',
    where: { sku: { equals: sku } },
    limit: 1,
    depth: 1,
    ...readOpts,
  })
  const variant = result.docs[0] as ProductVariant | undefined
  if (!variant) {
    throw new CartValidationError(`Unknown SKU ${sku}.`)
  }
  const product = variant.product as Product | number
  const productDoc = typeof product === 'object' ? product : null
  if (!productDoc) {
    throw new CartValidationError(`Unknown SKU ${sku}.`)
  }
  const rules = normalizeQuantityRules({
    moq: variant.moq ?? 1,
    orderMultiple: variant.orderMultiple ?? 1,
  })
  return {
    sku: variant.sku,
    variantId: variant.id,
    productId: productDoc.id,
    productName: productDoc.name,
    catalogHidden: productDoc.catalogHidden === true,
    discontinued: variant.discontinued === true,
    moq: rules.moq,
    orderMultiple: rules.orderMultiple,
  }
}

export async function loadVariantForOrdering(
  payload: Payload,
  sku: string,
  readOpts: { overrideAccess: boolean; req?: import('payload').PayloadRequest },
): Promise<VariantOrderRules> {
  const meta = await loadVariantCartMeta(payload, sku, readOpts)
  if (meta.catalogHidden) {
    throw new CartValidationError('This product is not available to order.')
  }
  if (meta.discontinued) {
    throw new CartValidationError('This finish is discontinued and cannot be ordered.')
  }
  return meta
}

export function assertValidCartQuantity(quantity: number, rules: Pick<VariantOrderRules, 'moq' | 'orderMultiple'>) {
  const normalized = normalizeQuantityRules(rules)
  const message = validateOrderQuantity(quantity, normalized)
  if (message) throw new CartValidationError(message)
}

export function unavailableReason(meta: Pick<VariantCartMeta, 'catalogHidden' | 'discontinued'>): string | null {
  if (meta.catalogHidden) return 'This product is not available to order.'
  if (meta.discontinued) return 'This finish is discontinued and cannot be ordered.'
  return null
}
