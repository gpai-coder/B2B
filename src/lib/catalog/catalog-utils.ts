import type { CatalogProductDTO, CatalogSearchParams, PriceDTO } from './types'

export function parseCatalogSearchParams(
  raw: Record<string, string | string[] | undefined>,
): CatalogSearchParams {
  const arr = (key: string) => {
    const v = raw[key]
    if (!v) return undefined
    if (Array.isArray(v)) return v.filter(Boolean)
    return v.split(',').filter(Boolean)
  }
  return {
    finish: arr('finish'),
    collection: arr('collection'),
    handleType: arr('handleType'),
    holes: arr('holes'),
    ada: arr('ada'),
    inStock: raw.inStock === '1',
    showDiscontinued: raw.showDiscontinued === '1',
    sort: typeof raw.sort === 'string' ? raw.sort : undefined,
    page: raw.page ? Number(raw.page) : 1,
  }
}

export function buildFacetCounts(products: CatalogProductDTO[]) {
  const finish = new Map<string, number>()
  const collection = new Map<string, number>()
  const handleType = new Map<string, number>()
  const holes = new Map<string, number>()
  const ada = new Map<string, number>()

  for (const p of products) {
    collection.set(p.productCollection, (collection.get(p.productCollection) ?? 0) + 1)
    if (p.facetMeta?.handleType) {
      handleType.set(p.facetMeta.handleType, (handleType.get(p.facetMeta.handleType) ?? 0) + 1)
    }
    if (p.facetMeta?.holesRequired) {
      holes.set(p.facetMeta.holesRequired, (holes.get(p.facetMeta.holesRequired) ?? 0) + 1)
    }
    if (p.facetMeta?.ada) {
      ada.set(p.facetMeta.ada, (ada.get(p.facetMeta.ada) ?? 0) + 1)
    }
    for (const v of p.variants) {
      finish.set(v.finish, (finish.get(v.finish) ?? 0) + 1)
    }
  }

  return { finish, collection, handleType, holes, ada }
}

function productMatchesFilters(
  product: CatalogProductDTO,
  params: CatalogSearchParams,
  priceBySku: Map<string, PriceDTO>,
) {
  if (params.collection?.length && !params.collection.includes(product.productCollection)) {
    return false
  }
  if (params.handleType?.length && !params.handleType.includes(product.facetMeta?.handleType ?? '')) {
    return false
  }
  if (params.holes?.length && !params.holes.includes(product.facetMeta?.holesRequired ?? '')) {
    return false
  }
  if (params.ada?.length && !params.ada.includes(product.facetMeta?.ada ?? '')) {
    return false
  }

  const variants = product.variants.filter((v) => {
    if (params.finish?.length && !params.finish.includes(v.finish)) return false
    if (!params.showDiscontinued && v.discontinued) return false
    if (params.inStock && !v.inStock) return false
    return true
  })

  if (params.finish?.length || params.inStock || !params.showDiscontinued) {
    if (variants.length === 0) return false
  }

  if (params.inStock && !variants.some((v) => v.inStock && priceBySku.has(v.sku))) {
    return false
  }

  return true
}

function sortProducts(
  a: CatalogProductDTO,
  b: CatalogProductDTO,
  sort: string,
  priceBySku: Map<string, PriceDTO>,
) {
  const priceA = priceBySku.get(a.variants[0]?.sku ?? '')?.unitPrice.amount ?? 0
  const priceB = priceBySku.get(b.variants[0]?.sku ?? '')?.unitPrice.amount ?? 0
  switch (sort) {
    case 'price-asc':
      return priceA - priceB
    case 'price-desc':
      return priceB - priceA
    case 'title-asc':
      return a.name.localeCompare(b.name)
    case 'title-desc':
      return b.name.localeCompare(a.name)
    case 'model-asc':
      return (a.modelNumber ?? '').localeCompare(b.modelNumber ?? '')
    case 'newest':
      return b.id - a.id
    default:
      return a.name.localeCompare(b.name)
  }
}

export function filterAndSortCatalog(
  products: CatalogProductDTO[],
  params: CatalogSearchParams,
  priceBySku: Map<string, PriceDTO>,
) {
  const filtered = products.filter((p) => productMatchesFilters(p, params, priceBySku))
  const sort = params.sort ?? 'relevance'
  filtered.sort((a, b) => sortProducts(a, b, sort, priceBySku))
  return filtered
}

export function serializeCatalogParams(params: CatalogSearchParams): URLSearchParams {
  const sp = new URLSearchParams()
  for (const f of params.finish ?? []) sp.append('finish', f)
  for (const c of params.collection ?? []) sp.append('collection', c)
  for (const h of params.handleType ?? []) sp.append('handleType', h)
  for (const h of params.holes ?? []) sp.append('holes', h)
  for (const a of params.ada ?? []) sp.append('ada', a)
  if (params.inStock) sp.set('inStock', '1')
  if (params.showDiscontinued) sp.set('showDiscontinued', '1')
  if (params.sort) sp.set('sort', params.sort)
  if (params.page && params.page > 1) sp.set('page', String(params.page))
  return sp
}
