import { getPayload } from 'payload'

import { getCommerce } from '@/commerce'
import config from '@/payload.config'
import { resolveCatalogDefaultPricingForProducts } from '@/lib/catalog/catalog-default-pricing'
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

  const productIds = [...new Set(result.hits.map((h) => h.productId))]
  const { defaultSkuByProduct, priceBySku, prices } = await resolveCatalogDefaultPricingForProducts({
    payload,
    user,
    companyId,
    productIds,
  })

  const priced = applyPostPricingSearch(result.hits, {
    sort: parsed.sort,
    minPrice: parsed.minPrice,
    maxPrice: parsed.maxPrice,
    page: parsed.page,
    pageSize,
    priceBySku,
    defaultSkuByProduct,
  })

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
