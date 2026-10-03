export type SearchSort = 'relevance' | 'name' | 'price-asc' | 'price-desc'

export type SearchQueryInput = {
  q: string
  category?: string
  finish?: string
  minPrice?: number
  maxPrice?: number
  sort?: SearchSort
  page?: number
  pageSize?: number
  showDiscontinued?: boolean
}

export type SearchHit = {
  productId: number
  slug: string
  name: string
  modelNumber: string | null
  primaryImageMediaId: number | null
  score: number
}

export type SearchFacets = {
  categories: Array<{ value: string; label: string; count: number }>
  finishes: Array<{ value: string; count: number }>
}

export type SearchResult = {
  hits: SearchHit[]
  total: number
  page: number
  pageSize: number
  facets: SearchFacets
}

export type SearchContext = {
  /** When set, price sort/filter uses contract pricing for this company. */
  companyId: string | null
}
