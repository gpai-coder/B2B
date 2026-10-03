import type { PriceDTO } from '@/lib/catalog/types'

import type { SearchHit, SearchSort } from './types'

export function filterHitsByPriceRange(
  hits: SearchHit[],
  minPrice: number | undefined,
  maxPrice: number | undefined,
  priceBySku: Map<string, PriceDTO>,
  defaultSkuByProduct: Map<number, string>,
): SearchHit[] {
  if (minPrice == null && maxPrice == null) return hits
  return hits.filter((hit) => {
    const sku = defaultSkuByProduct.get(hit.productId)
    if (!sku) return false
    const amount = priceBySku.get(sku)?.unitPrice.amount
    if (amount == null) return false
    if (minPrice != null && amount < minPrice) return false
    if (maxPrice != null && amount > maxPrice) return false
    return true
  })
}

export function sortHitsByPrice(
  hits: SearchHit[],
  sort: 'price-asc' | 'price-desc',
  priceBySku: Map<string, PriceDTO>,
  defaultSkuByProduct: Map<number, string>,
): SearchHit[] {
  const copy = [...hits]
  copy.sort((a, b) => {
    const skuA = defaultSkuByProduct.get(a.productId)
    const skuB = defaultSkuByProduct.get(b.productId)
    const priceA = skuA
      ? (priceBySku.get(skuA)?.unitPrice.amount ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER
    const priceB = skuB
      ? (priceBySku.get(skuB)?.unitPrice.amount ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER
    return sort === 'price-asc' ? priceA - priceB : priceB - priceA
  })
  return copy
}

export function paginateHits<T>(hits: T[], page: number, pageSize: number): { pageHits: T[]; total: number } {
  const safePage = Math.max(1, page)
  const safeSize = Math.max(1, pageSize)
  const total = hits.length
  const offset = (safePage - 1) * safeSize
  return { pageHits: hits.slice(offset, offset + safeSize), total }
}

export function applyPostPricingSearch(
  hits: SearchHit[],
  args: {
    sort: SearchSort
    minPrice?: number
    maxPrice?: number
    page: number
    pageSize: number
    priceBySku: Map<string, PriceDTO>
    defaultSkuByProduct: Map<number, string>
  },
): { hits: SearchHit[]; total: number } {
  let working = filterHitsByPriceRange(
    hits,
    args.minPrice,
    args.maxPrice,
    args.priceBySku,
    args.defaultSkuByProduct,
  )

  if (args.sort === 'price-asc' || args.sort === 'price-desc') {
    working = sortHitsByPrice(working, args.sort, args.priceBySku, args.defaultSkuByProduct)
  } else if (args.sort === 'name') {
    working = [...working].sort((a, b) => a.name.localeCompare(b.name) || a.productId - b.productId)
  }

  const { pageHits, total } = paginateHits(working, args.page, args.pageSize)
  return { hits: pageHits, total }
}