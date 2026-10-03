import type { Payload } from 'payload'

import type { Product, ProductVariant } from '@/payload-types'
import { normalizeQuantityRules, validateOrderQuantity } from '@/lib/cart/quantity-rules'

export class CartValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CartValidationError'
  }
}

export type VariantOrderRules = {
  sku: string
  variantId: number
  productId: number
  productName: string
  catalogHidden: boolean
  discontinued: boolean
  moq: number
  orderMultiple: number
}

export async function loadVariantForOrdering(
  payload: Payload,
  sku: string,
  readOpts: { overrideAccess: boolean; req?: import('payload').PayloadRequest },
): Promise<VariantOrderRules> {
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
  if (productDoc.catalogHidden === true) {
    throw new CartValidationError('This product is not available to order.')
  }
  if (variant.discontinued === true) {
    throw new CartValidationError('This finish is discontinued and cannot be ordered.')
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
    catalogHidden: false,
    discontinued: false,
    moq: rules.moq,
    orderMultiple: rules.orderMultiple,
  }
}

export function assertValidCartQuantity(quantity: number, rules: Pick<VariantOrderRules, 'moq' | 'orderMultiple'>) {
  const normalized = normalizeQuantityRules(rules)
  const message = validateOrderQuantity(quantity, normalized)
  if (message) throw new CartValidationError(message)
}
