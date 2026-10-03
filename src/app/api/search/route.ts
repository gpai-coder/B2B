import { getPayload } from 'payload'

import { getCommerce } from '@/commerce'
import config from '@/payload.config'
import { pickDefaultVariantSku } from '@/lib/catalog/default-variant'
import type { PriceDTO } from '@/lib/catalog/types'
import { getSearchProvider } from '@/lib/search'
import { applyPostPricingSearch } from '@/lib/search/search-pagination'
import { parseSearchRequestParams } from '@/lib/search/validate'
import { createPayloadReq } from '@/lib/payload-req'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return Response.json({ error: 'Vendor account is missing a company.' }, { status: 403 })
  }

  const parsed = parseSearchRequestParams(new URL(request.url).searchParams)

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

  const pageSize = parsed.limit ?? 12
  const result = await search.search(
    {
      q: parsed.q,
      category: parsed.category,
      finish: parsed.finish,
      sort: parsed.sort,
      page: parsed.page,
      pageSize,
      showDiscontinued: false,
    },
    ctx,
  )

  const productIds = result.hits.map((h) => h.productId)
  const variantsResult = await payload.find({
    collection: 'product-variants',
    where: { product: { in: productIds.length ? productIds : [-1] } },
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

  const priced = applyPostPricingSearch(result.hits, {
    sort: parsed.sort,
    minPrice: parsed.minPrice,
    maxPrice: parsed.maxPrice,
    page: parsed.page,
    pageSize,
    priceBySku,
    defaultSkuByProduct,
  })

  const prices: Record<string, PriceDTO> = {}
  for (const sku of skus) {
    const row = priceBySku.get(sku)
    if (row) prices[sku] = row
  }

  return Response.json(
    {
      ...result,
      hits: priced.hits,
      total: priced.total,
      page: parsed.page,
      pageSize,
      prices,
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=30',
      },
    },
  )
}
