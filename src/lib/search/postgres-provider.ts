import type { Payload } from 'payload'

import type { SearchProvider } from './provider'
import { buildSearchSql, type BoundSql } from './postgres-search-sql'
import { isEmptySearchQuery, sanitizeSearchQuery } from './postgres-query'
import type { SearchContext, SearchHit, SearchQueryInput, SearchResult, SearchFacets } from './types'

type Row = {
  id: number
  slug: string
  name: string
  model_number: string | null
  primary_image_id: number | null
  score: number
}

function mapRow(row: Row): SearchHit {
  return {
    productId: row.id,
    slug: row.slug,
    name: row.name,
    modelNumber: row.model_number,
    primaryImageMediaId: row.primary_image_id,
    score: Number(row.score ?? 0),
  }
}

function parseFacetRows(
  rows: Array<{ category: string | null; finish: string | null; cnt: number }>,
): SearchFacets {
  const categories = new Map<string, number>()
  const finishes = new Map<string, number>()
  for (const row of rows) {
    if (row.category) {
      categories.set(row.category, (categories.get(row.category) ?? 0) + row.cnt)
    }
    if (row.finish) {
      finishes.set(row.finish, (finishes.get(row.finish) ?? 0) + row.cnt)
    }
  }
  const categoryLabels: Record<string, string> = {
    'bathroom-faucet': 'Bathroom faucet',
    'kitchen-faucet': 'Kitchen faucet',
    toilet: 'Toilet',
  }
  return {
    categories: [...categories.entries()]
      .map(([value, count]) => ({
        value,
        label: categoryLabels[value] ?? value,
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    finishes: [...finishes.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value)),
  }
}

async function executeRows<T extends Record<string, unknown>>(
  payload: Payload,
  query: BoundSql,
): Promise<T[]> {
  const result = await payload.db.execute({ drizzle: payload.db.drizzle, sql: query })
  if (Array.isArray(result)) {
    return result as T[]
  }
  const rows = (result as { rows?: T[] }).rows
  return rows ?? []
}

export class PostgresSearchProvider implements SearchProvider {
  constructor(private readonly payload: Payload) {}

  async suggest(q: string, limit: number, ctx: SearchContext): Promise<SearchHit[]> {
    void ctx
    const built = buildSearchSql({
      rawQ: q,
      showDiscontinued: false,
      limit: Math.min(limit, 6),
      offset: 0,
      sort: 'relevance',
    })
    if (!built) return []
    const rows = await executeRows<Row>(this.payload, built.listSql)
    return rows.map(mapRow)
  }

  async search(input: SearchQueryInput, ctx: SearchContext): Promise<SearchResult> {
    void ctx
    const pageSize = Math.min(input.pageSize ?? 12, 48)
    const page = Math.max(input.page ?? 1, 1)
    const built = buildSearchSql({
      rawQ: input.q,
      category: input.category,
      finish: input.finish,
      showDiscontinued: input.showDiscontinued ?? false,
      sort: input.sort === 'name' ? 'name' : 'relevance',
    })
    if (!built) {
      return {
        hits: [],
        total: 0,
        page,
        pageSize,
        facets: { categories: [], finishes: [] },
      }
    }

    const [rows, countRows, facetRows] = await Promise.all([
      executeRows<Row>(this.payload, built.listSql),
      executeRows<{ total: number }>(this.payload, built.countSql),
      executeRows<{ category: string | null; finish: string | null; cnt: number }>(
        this.payload,
        built.facetSql,
      ),
    ])

    let hits = rows.map(mapRow)
    if (input.sort === 'name') {
      hits = [...hits].sort((a, b) => a.name.localeCompare(b.name) || a.productId - b.productId)
    }

    return {
      hits,
      total: countRows[0]?.total ?? hits.length,
      page,
      pageSize,
      facets: parseFacetRows(facetRows),
    }
  }
}

export function createPostgresSearchProvider(payload: Payload): SearchProvider {
  return new PostgresSearchProvider(payload)
}

export { sanitizeSearchQuery, isEmptySearchQuery }
