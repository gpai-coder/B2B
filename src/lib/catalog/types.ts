export type CatalogVariantDTO = {
  id: number
  sku: string
  finish: string
  msrp?: number | null
  inStock: boolean
  discontinued: boolean
  imageMediaIds: number[]
}

export type CatalogProductDTO = {
  id: number
  slug: string
  name: string
  modelNumber?: string | null
  productCollection: string
  catalogCategory?: string | null
  primaryImageId?: number | null
  variants: CatalogVariantDTO[]
  facetMeta?: {
    handleType?: string | null
    holesRequired?: string | null
    ada?: string | null
  } | null
}

export type PriceDTO = {
  sku: string
  unitPrice: { amount: number; currency: string }
  source: 'company' | 'standard'
  quantityBreaks?: Array<{ minQuantity: number; unitPrice: number }>
}

export type CatalogSearchParams = {
  finish?: string[]
  collection?: string[]
  handleType?: string[]
  holes?: string[]
  ada?: string[]
  inStock?: boolean
  showDiscontinued?: boolean
  sort?: string
  page?: number
}

export const CATALOG_PAGE_SIZE = 12

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price (Low to High)' },
  { value: 'price-desc', label: 'Price (High to Low)' },
  { value: 'title-asc', label: 'Product Title (A to Z)' },
  { value: 'title-desc', label: 'Product Title (Z to A)' },
  { value: 'model-asc', label: 'Model # (A–Z)' },
] as const
