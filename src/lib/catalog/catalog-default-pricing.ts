import type { Payload, PayloadRequest } from 'payload'

import { getCommerce } from '@/commerce'
import { createPayloadReq } from '@/lib/payload-req'
import type { ProductVariant, User } from '@/payload-types'

import { pickDefaultVariantSku } from './default-variant'
import type { PriceDTO } from './types'

export function sortVariantsById(variants: ProductVariant[]): ProductVariant[] {
  return [...variants].sort((a, b) => a.id - b.id)
}

export function buildDefaultSkuByProduct(
  variantsByProduct: Map<number, ProductVariant[]>,
  prices: Record<string, PriceDTO | undefined>,
): Map<number, string> {
  const defaultSkuByProduct = new Map<number, string>()
  for (const [productId, variants] of variantsByProduct) {
    const sorted = sortVariantsById(variants)
    const sku = pickDefaultVariantSku(
      sorted.map((v) => ({
        sku: v.sku,
        inStock: v.inStock === true,
        discontinued: v.discontinued === true,
      })),
      prices,
    )
    if (sku) defaultSkuByProduct.set(productId, sku)
  }
  return defaultSkuByProduct
}

export async function resolveCatalogDefaultPricingForProducts(args: {
  payload: Payload
  user: User
  companyId: string
  productIds: number[]
}): Promise<{
  variantsByProduct: Map<number, ProductVariant[]>
  defaultSkuByProduct: Map<number, string>
  priceBySku: Map<string, PriceDTO>
  prices: Record<string, PriceDTO>
}> {
  const { payload, user, companyId, productIds } = args
  const req: PayloadRequest = createPayloadReq(payload, user)

  const variantsByProduct = new Map<number, ProductVariant[]>()
  if (productIds.length > 0) {
    const variantsResult = await payload.find({
      collection: 'product-variants',
      where: { product: { in: productIds } },
      sort: 'id',
      limit: 500,
      depth: 0,
      overrideAccess: false,
      req,
    })
    for (const variant of variantsResult.docs) {
      const productId = typeof variant.product === 'object' ? variant.product.id : variant.product
      const list = variantsByProduct.get(productId) ?? []
      list.push(variant)
      variantsByProduct.set(productId, list)
    }
  }

  const allSkus = [
    ...new Set([...variantsByProduct.values()].flatMap((variants) => variants.map((v) => v.sku))),
  ]
  const commerce = await getCommerce({ user })
  const priceRows = allSkus.length ? await commerce.getPrices(companyId, allSkus) : []
  const prices: Record<string, PriceDTO> = {}
  const priceBySku = new Map<string, PriceDTO>()
  for (const row of priceRows) {
    prices[row.sku] = row as PriceDTO
    priceBySku.set(row.sku, row as PriceDTO)
  }

  const defaultSkuByProduct = buildDefaultSkuByProduct(variantsByProduct, prices)

  return { variantsByProduct, defaultSkuByProduct, priceBySku, prices }
}
