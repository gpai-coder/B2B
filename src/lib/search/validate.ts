import { z } from 'zod'

import { SEARCH_MAX_QUERY_LENGTH } from '@/lib/search/postgres-query'
import type { SearchSort } from '@/lib/search/types'

const sortSchema = z.enum(['relevance', 'name', 'price-asc', 'price-desc'])
const categorySchema = z.enum(['bathroom-faucet', 'kitchen-faucet', 'toilet'])

export type ParsedSearchQuery = {
  q: string
  category?: string
  finish?: string
  minPrice?: number
  maxPrice?: number
  sort: SearchSort
  page: number
  limit?: number
  suggest: boolean
}

export function parseSearchRequestParams(params: URLSearchParams): ParsedSearchQuery {
  const qParsed = z.string().max(SEARCH_MAX_QUERY_LENGTH).safeParse(params.get('q') ?? '')
  const q = qParsed.success ? qParsed.data : ''

  const categoryRaw = params.get('category')
  const categoryParsed = categorySchema.safeParse(categoryRaw)
  const category = categoryParsed.success ? categoryParsed.data : undefined

  const finishRaw = params.get('finish')
  const finishParsed = z.string().max(80).safeParse(finishRaw ?? undefined)
  const finish = finishParsed.success ? finishParsed.data : undefined

  const minPriceParsed = z.coerce.number().min(0).safeParse(params.get('minPrice') ?? undefined)
  const minPrice = minPriceParsed.success ? minPriceParsed.data : undefined

  const maxPriceParsed = z.coerce.number().min(0).safeParse(params.get('maxPrice') ?? undefined)
  const maxPrice = maxPriceParsed.success ? maxPriceParsed.data : undefined

  const sortParsed = sortSchema.safeParse(params.get('sort') ?? undefined)
  const sort: SearchSort = sortParsed.success ? sortParsed.data : 'relevance'

  const pageParsed = z.coerce.number().int().min(1).max(500).safeParse(params.get('page') ?? undefined)
  const page = pageParsed.success ? pageParsed.data : 1

  const limitParsed = z.coerce.number().int().min(1).max(48).safeParse(params.get('limit') ?? undefined)
  const limit = limitParsed.success ? limitParsed.data : undefined

  const suggestRaw = params.get('suggest')
  const suggest = suggestRaw === '1' || suggestRaw === 'true'

  return {
    q,
    category,
    finish,
    minPrice,
    maxPrice,
    sort,
    page,
    limit,
    suggest,
  }
}
