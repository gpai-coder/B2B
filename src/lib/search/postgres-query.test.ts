import { describe, expect, it } from 'vitest'

import {
  buildTextMatchClause,
  catalogVisibilityWhere,
  sanitizeSearchQuery,
  SEARCH_MAX_QUERY_LENGTH,
} from '@/lib/search/postgres-query'
import { buildSearchSql } from '@/lib/search/postgres-search-sql'

describe('sanitizeSearchQuery', () => {
  it('trims and caps length', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeSearchQuery(long).length).toBeLessThanOrEqual(SEARCH_MAX_QUERY_LENGTH)
  })

  it('strips dangerous characters', () => {
    expect(sanitizeSearchQuery("townsnd'; DROP TABLE--")).toBe('townsnd DROP TABLE--')
  })
})

describe('buildSearchSql', () => {
  it('includes fts, trgm, and visibility clauses', () => {
    const built = buildSearchSql({
      rawQ: '7353101.002',
      showDiscontinued: false,
      limit: 12,
      offset: 0,
      sort: 'relevance',
    })
    expect(built?.listSql).toMatch(/websearch_to_tsquery/)
    expect(built?.listSql).toMatch(/catalog_hidden/)
    expect(built?.listSql).toMatch(buildTextMatchClause().split('(')[0].trim())
    expect(built?.listSql).toMatch(catalogVisibilityWhere(false).split('(')[0].trim())
  })
})
