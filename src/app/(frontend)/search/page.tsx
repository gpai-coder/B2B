import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { getPayload } from 'payload'

import config from '@/payload.config'
import { getCommerce } from '@/commerce'
import { SearchPageClient } from '@/components/catalog/SearchPageClient'
import { mapProductToDTO } from '@/lib/catalog/map-payload'
import type { PriceDTO } from '@/lib/catalog/types'
import { pickDefaultVariantSku } from '@/lib/catalog/default-variant'
import { getSearchProvider } from '@/lib/search'
import { isEmptySearchQuery, sanitizeSearchQuery } from '@/lib/search/postgres-query'
import { parseSearchRequestParams } from '@/lib/search/validate'
import type { SearchHit } from '@/lib/search/types'
import { createPayloadReq } from '@/lib/payload-req'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function applyPriceSortHits(
  hits: SearchHit[],
  sort: 'price-asc' | 'price-desc',
  priceBySku: Map<string, PriceDTO>,
  defaultSkuByProduct: Map<number, string>,
): SearchHit[] {
  const copy = [...hits]
  copy.sort((a, b) => {
    const skuA = defaultSkuByProduct.get(a.productId)
    const skuB = defaultSkuByProduct.get(b.productId)
    const priceA = skuA ? (priceBySku.get(skuA)?.unitPrice.amount ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
    const priceB = skuB ? (priceBySku.get(skuB)?.unitPrice.amount ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
    return sort === 'price-asc' ? priceA - priceB : priceB - priceA
  })
  return copy
}

export default async function SearchPage({ searchParams }: PageProps) {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    const raw = await searchParams
    const q = typeof raw.q === 'string' ? raw.q : ''
    redirect(`/login?next=${encodeURIComponent(q ? `/search?q=${encodeURIComponent(q)}` : '/search')}`)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const raw = await searchParams
  const params = parseSearchRequestParams(
    new URLSearchParams(
      Object.entries(raw).flatMap(([key, value]) => {
        if (value == null) return [] as [string, string][]
        if (Array.isArray(value)) return value.map((v) => [key, v] as [string, string])
        return [[key, value] as [string, string]]
      }),
    ),
  )

  const q = sanitizeSearchQuery(params.q)
  if (isEmptySearchQuery(q)) {
    return (
      <div className="as-search-page__empty" data-testid="search-empty">
        <h1>Search catalog</h1>
        <p>Enter a model number, SKU, or product name in the header search box.</p>
      </div>
    )
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const search = getSearchProvider(payload)
  let hits: SearchHit[] = []
  let total = 0
  let facets: { categories: Array<{ value: string; label: string; count: number }>; finishes: Array<{ value: string; count: number }> } = {
    categories: [],
    finishes: [],
  }
  for (let p = 1; p <= params.page; p++) {
    const pageResult = await search.search(
      {
        q,
        category: params.category,
        finish: params.finish,
        sort: params.sort,
        page: p,
        pageSize: 12,
        showDiscontinued: false,
      },
      { companyId },
    )
    if (p === 1) {
      total = pageResult.total
      facets = pageResult.facets
    }
    hits.push(...pageResult.hits)
  }

  const productIds = [...new Set(hits.map((h) => h.productId))]
  if (productIds.length === 0) {
    return (
      <Suspense fallback={<p>Loading…</p>}>
        <SearchPageClient
          query={q}
          products={[]}
          prices={{}}
          total={0}
          facets={facets}
          category={params.category}
          finish={params.finish}
          minPrice={params.minPrice}
          maxPrice={params.maxPrice}
          sort={params.sort}
          page={params.page}
        />
      </Suspense>
    )
  }

  const productsResult = await payload.find({
    collection: 'products',
    where: { id: { in: productIds } },
    limit: productIds.length,
    depth: 1,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const variantsResult = await payload.find({
    collection: 'product-variants',
    where: { product: { in: productIds } },
    limit: 500,
    depth: 1,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const variantsByProduct = new Map<number, typeof variantsResult.docs>()
  for (const variant of variantsResult.docs) {
    const productId = typeof variant.product === 'object' ? variant.product.id : variant.product
    const list = variantsByProduct.get(productId) ?? []
    list.push(variant)
    variantsByProduct.set(productId, list)
  }

  const dtoById = new Map(
    productsResult.docs.map((p) => [p.id, mapProductToDTO(p, variantsByProduct.get(p.id) ?? [])]),
  )

  const defaultSkuByProduct = new Map<number, string>()
  for (const [productId, variants] of variantsByProduct) {
    const sku = pickDefaultVariantSku(
      variants.map((v) => ({
        sku: v.sku,
        inStock: v.inStock === true,
        discontinued: v.discontinued === true,
      })),
      {},
    )
    if (sku) defaultSkuByProduct.set(productId, sku)
  }

  const skus = [...new Set(defaultSkuByProduct.values())]
  const commerce = await getCommerce({ user })
  const priceRows = skus.length ? await commerce.getPrices(companyId, skus) : []
  const priceBySku = new Map<string, PriceDTO>()
  const prices: Record<string, PriceDTO> = {}
  for (const row of priceRows) {
    priceBySku.set(row.sku, row as PriceDTO)
    prices[row.sku] = row as PriceDTO
  }

  if (params.minPrice != null || params.maxPrice != null) {
    hits = hits.filter((hit) => {
      const sku = defaultSkuByProduct.get(hit.productId)
      if (!sku) return false
      const amount = priceBySku.get(sku)?.unitPrice.amount
      if (amount == null) return false
      if (params.minPrice != null && amount < params.minPrice) return false
      if (params.maxPrice != null && amount > params.maxPrice) return false
      return true
    })
  }

  if (params.sort === 'price-asc' || params.sort === 'price-desc') {
    hits = applyPriceSortHits(hits, params.sort, priceBySku, defaultSkuByProduct)
  }

  const products = hits
    .map((h) => dtoById.get(h.productId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <Suspense fallback={<p>Loading search…</p>}>
      <SearchPageClient
        query={q}
        products={products}
        prices={prices}
        total={params.minPrice != null || params.maxPrice != null ? products.length : total}
        facets={facets}
        category={params.category}
        finish={params.finish}
        minPrice={params.minPrice}
        maxPrice={params.maxPrice}
        sort={params.sort}
        page={params.page}
      />
    </Suspense>
  )
}

export const metadata = {
  title: 'Search | B2B Portal',
}
