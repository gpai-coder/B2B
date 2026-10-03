import { describe, expect, it } from 'vitest'

import type { SearchHit } from '@/lib/search/types'
import { applyPostPricingSearch, paginateHits } from '@/lib/search/search-pagination'
import type { PriceDTO } from '@/lib/catalog/types'

function hit(id: number, name: string): SearchHit {
  return {
    productId: id,
    slug: `p-${id}`,
    name,
    modelNumber: null,
    primaryImageMediaId: null,
    score: 1,
  }
}

describe('paginateHits', () => {
  it('pages after filtering when page size is smaller than the result set', () => {
    const hits = [hit(1, 'a'), hit(2, 'b'), hit(3, 'c')]
    const page1 = paginateHits(hits, 1, 2)
    expect(page1.total).toBe(3)
    expect(page1.pageHits.map((h) => h.productId)).toEqual([1, 2])
    const page2 = paginateHits(hits, 2, 2)
    expect(page2.pageHits.map((h) => h.productId)).toEqual([3])
  })
})

describe('applyPostPricingSearch', () => {
  it('filters by price then paginates with correct total', () => {
    const hits = [hit(1, 'A'), hit(2, 'B'), hit(3, 'C')]
    const defaultSkuByProduct = new Map<number, string>([
      [1, 'SKU1'],
      [2, 'SKU2'],
      [3, 'SKU3'],
    ])
    const priceBySku = new Map<string, PriceDTO>([
      [
        'SKU1',
        {
          sku: 'SKU1',
          source: 'company',
          unitPrice: { amount: 50, currency: 'USD' },
        } as PriceDTO,
      ],
      [
        'SKU2',
        {
          sku: 'SKU2',
          source: 'company',
          unitPrice: { amount: 150, currency: 'USD' },
        } as PriceDTO,
      ],
      [
        'SKU3',
        {
          sku: 'SKU3',
          source: 'company',
          unitPrice: { amount: 75, currency: 'USD' },
        } as PriceDTO,
      ],
    ])

    const page1 = applyPostPricingSearch(hits, {
      sort: 'relevance',
      minPrice: 60,
      maxPrice: 200,
      page: 1,
      pageSize: 1,
      priceBySku,
      defaultSkuByProduct,
    })
    expect(page1.total).toBe(2)
    expect(page1.hits).toHaveLength(1)
    expect(page1.hits[0]?.productId).toBe(2)

    const page2 = applyPostPricingSearch(hits, {
      sort: 'relevance',
      minPrice: 60,
      maxPrice: 200,
      page: 2,
      pageSize: 1,
      priceBySku,
      defaultSkuByProduct,
    })
    expect(page2.hits[0]?.productId).toBe(3)
  })
})
