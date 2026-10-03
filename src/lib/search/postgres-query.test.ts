import { describe, expect, it } from 'vitest'

import {
  sanitizeSearchQuery,
  SEARCH_MAX_QUERY_LENGTH,
} from '@/lib/search/postgres-query'
import { buildSearchSql, searchQuerySqlText } from '@/lib/search/postgres-search-sql'

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
  it('uses parameterized SQL (user input never inlined in SQL text)', () => {
    const maliciousQ = "towns' OR 1=1 --"
    const maliciousFinish = "x\\' OR 1=1 --"
    const built = buildSearchSql({
      rawQ: maliciousQ,
      finish: maliciousFinish,
      category: 'bathroom-faucet',
      showDiscontinued: false,
      limit: 5,
      offset: 10,
      sort: 'relevance',
    })
    expect(built).not.toBeNull()
    const sqlText = searchQuerySqlText(built!.listSql)
    expect(sqlText).toMatch(/websearch_to_tsquery/)
    expect(sqlText).toMatch(/catalog_hidden/)
    expect(sqlText).not.toContain(maliciousQ)
    expect(sqlText).not.toContain(maliciousFinish)
    expect(sqlText).not.toContain('bathroom-faucet')
    expect(sqlText).toMatch(/\?/)
  })
})
