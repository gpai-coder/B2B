import { getPayload } from 'payload'
import { z } from 'zod'

import { getCommerce } from '@/commerce'
import config from '@/payload.config'
import { pickDefaultVariantSku } from '@/lib/catalog/default-variant'
import type { PriceDTO } from '@/lib/catalog/types'
import { getSearchProvider } from '@/lib/search'
import { parseSearchRequestParams } from '@/lib/search/validate'
import type { SearchHit } from '@/lib/search/types'
import { createPayloadReq } from '@/lib/payload-req'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

function applyPriceSort(
  hits: SearchHit[],
  sort: 'price-asc' | 'price-desc',
  priceBySku: Map<string, PriceDTO>,
  defaultSkuByProduct: Map<number, string>,
): SearchHit[] {
  const withPrice = [...hits]
  withPrice.sort((a, b) => {
    const skuA = defaultSkuByProduct.get(a.productId)
    const skuB = defaultSkuByProduct.get(b.productId)
    const priceA = skuA ? (priceBySku.get(skuA)?.unitPrice.amount ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
    const priceB = skuB ? (priceBySku.get(skuB)?.unitPrice.amount ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
    return sort === 'price-asc' ? priceA - priceB : priceB - priceA
  })
  return withPrice
}

function filterByPriceRange(
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

export async function GET(request: Request) {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return Response.json({ error: 'Vendor account is missing a company.' }, { status: 403 })
  }

  let parsed
  try {
    parsed = parseSearchRequestParams(new URL(request.url).searchParams)
  } catch (err) {
    const message = err instanceof z.ZodError ? err.flatten() : 'Invalid query'
    return Response.json({ error: message }, { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const search = getSearchProvider(payload)
  const ctx = { companyId }

  if (parsed.suggest) {
    const suggestions = await search.suggest(parsed.q, 6, ctx)
    return Response.json(
      { suggestions },
      {
        headers: {
          'Cache-Control': 'private, max-age=30',
        },
      },
    )
  }

  const result = await search.search(
    {
      q: parsed.q,
      category: parsed.category,
      finish: parsed.finish,
      minPrice: parsed.minPrice,
      maxPrice: parsed.maxPrice,
      sort: parsed.sort,
      page: parsed.page,
      pageSize: parsed.limit ?? 12,
      showDiscontinued: false,
    },
    ctx,
  )

  const productIds = result.hits.map((h) => h.productId)
  const variantsResult = await payload.find({
    collection: 'product-variants',
    where: { product: { in: productIds } },
    limit: 500,
    depth: 0,
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
  for (const row of priceRows) {
    priceBySku.set(row.sku, row as PriceDTO)
  }

  let hits = filterByPriceRange(
    result.hits,
    parsed.minPrice,
    parsed.maxPrice,
    priceBySku,
    defaultSkuByProduct,
  )

  if (parsed.sort === 'price-asc' || parsed.sort === 'price-desc') {
    hits = applyPriceSort(hits, parsed.sort, priceBySku, defaultSkuByProduct)
  }

  const prices: Record<string, PriceDTO> = {}
  for (const sku of skus) {
    const row = priceBySku.get(sku)
    if (row) prices[sku] = row
  }

  return Response.json(
    {
      ...result,
      hits,
      total: parsed.minPrice != null || parsed.maxPrice != null ? hits.length : result.total,
      prices,
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=30',
      },
    },
  )
}
