import { z } from 'zod'

import { SEARCH_MAX_QUERY_LENGTH } from '@/lib/search/postgres-query'
import type { SearchSort } from '@/lib/search/types'

const sortSchema = z.enum(['relevance', 'name', 'price-asc', 'price-desc'])

export const searchQuerySchema = z.object({
  q: z.string().max(SEARCH_MAX_QUERY_LENGTH).optional().default(''),
  category: z.enum(['bathroom-faucet', 'kitchen-faucet', 'toilet']).optional(),
  finish: z.string().max(80).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: sortSchema.optional().default('relevance'),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce.number().int().min(1).max(48).optional(),
  suggest: z.enum(['1', 'true']).optional(),
})

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
  const parsed = searchQuerySchema.parse({
    q: params.get('q') ?? '',
    category: params.get('category') ?? undefined,
    finish: params.get('finish') ?? undefined,
    minPrice: params.get('minPrice') ?? undefined,
    maxPrice: params.get('maxPrice') ?? undefined,
    sort: params.get('sort') ?? undefined,
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
    suggest: params.get('suggest') ?? undefined,
  })
  return {
    ...parsed,
    suggest: parsed.suggest === '1' || parsed.suggest === 'true',
  }
}
