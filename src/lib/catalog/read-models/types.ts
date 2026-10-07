import type { ProductDetailDTO } from '@/components/catalog/ProductDetailView'
import type { CatalogProductDTO, PriceDTO } from '@/lib/catalog/types'
import type { SearchFacets } from '@/lib/search/types'
import type { ParsedSearchQuery } from '@/lib/search/validate'

/** Stable storefront catalog shapes (fixed Payload depth in loaders — do not vary depth in pages). */

export type CatalogListReadModel = {
  products: CatalogProductDTO[]
  prices: Record<string, PriceDTO>
}

export type ProductDetailReadModel = {
  product: ProductDetailDTO
  prices: Record<string, PriceDTO | undefined>
}

export type SearchResultsReadModel = {
  query: string
  products: CatalogProductDTO[]
  prices: Record<string, PriceDTO>
  total: number
  facets: SearchFacets
  params: ParsedSearchQuery
}
