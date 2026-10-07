import { resolveCatalogDefaultPricingForProducts } from '@/lib/catalog/catalog-default-pricing'
import { mapProductToDTO } from '@/lib/catalog/map-payload'
import type { CatalogProductDTO } from '@/lib/catalog/types'
import type { SearchResultsReadModel } from '@/lib/catalog/read-models/types'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import { getSearchProvider } from '@/lib/search'
import { isEmptySearchQuery, sanitizeSearchQuery } from '@/lib/search/postgres-query'
import { applyPostPricingSearch } from '@/lib/search/search-pagination'
import type { ParsedSearchQuery } from '@/lib/search/validate'
import type { User } from '@/payload-types'

const SEARCH_PRODUCT_DEPTH = 1

export async function loadSearchResultsReadModel(
  user: User,
  companyId: string,
  params: ParsedSearchQuery,
): Promise<SearchResultsReadModel | 'empty-query'> {
  const q = sanitizeSearchQuery(params.q)
  if (isEmptySearchQuery(q)) return 'empty-query'

  const payload = await getAppPayload()
  const search = getSearchProvider(payload)
  const pageSize = params.limit ?? 12

  const pageResult = await search.search(
    {
      q,
      category: params.category,
      finish: params.finish,
      sort: params.sort,
      page: params.page,
      pageSize,
      showDiscontinued: false,
    },
    { companyId },
  )

  const productIds = [...new Set(pageResult.hits.map((h) => h.productId))]
  if (productIds.length === 0) {
    return {
      query: q,
      products: [],
      prices: {},
      total: 0,
      facets: pageResult.facets,
      params,
    }
  }

  const { variantsByProduct, defaultSkuByProduct, priceBySku, prices } =
    await resolveCatalogDefaultPricingForProducts({
      payload,
      user,
      companyId,
      productIds,
    })

  const priced = applyPostPricingSearch(pageResult.hits, {
    sort: params.sort,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    page: params.page,
    pageSize,
    priceBySku,
    defaultSkuByProduct,
  })

  const pageProductIds = priced.hits.map((h) => h.productId)
  const productsResult = await payload.find({
    collection: 'products',
    where: { id: { in: pageProductIds.length ? pageProductIds : [-1] } },
    limit: pageProductIds.length,
    depth: SEARCH_PRODUCT_DEPTH,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const dtoById = new Map(
    productsResult.docs.map((p) => [p.id, mapProductToDTO(p, variantsByProduct.get(p.id) ?? [])]),
  )

  const products = priced.hits
    .map((h) => dtoById.get(h.productId))
    .filter((p): p is CatalogProductDTO => Boolean(p))

  return {
    query: q,
    products,
    prices,
    total: priced.total,
    facets: pageResult.facets,
    params,
  }
}
