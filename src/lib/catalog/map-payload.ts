import type { Product, ProductVariant } from '@/payload-types'

import { resolveMediaId } from '@/lib/product-media'

import type { CatalogProductDTO, CatalogVariantDTO } from './types'

export function mapVariantToDTO(variant: ProductVariant): CatalogVariantDTO {
  const imageMediaIds = (variant.images ?? [])
    .map((row) => resolveMediaId(row.image))
    .filter((id): id is number => id != null)

  return {
    id: variant.id,
    sku: variant.sku,
    finish: variant.finish ?? '',
    msrp: variant.msrp,
    inStock: variant.inStock !== false,
    discontinued: variant.discontinued === true,
    imageMediaIds,
  }
}

export function mapProductToDTO(product: Product, variants: ProductVariant[]): CatalogProductDTO {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    modelNumber: product.modelNumber,
    productCollection: product.productCollection,
    catalogCategory: product.catalogCategory,
    primaryImageId: resolveMediaId(product.primaryImage),
    variants: variants.map(mapVariantToDTO),
    facetMeta: product.facetMeta ?? null,
  }
}
