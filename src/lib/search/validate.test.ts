import { describe, expect, it } from 'vitest'

import { parseSearchRequestParams } from '@/lib/search/validate'

describe('parseSearchRequestParams', () => {
  it('falls back to defaults for invalid sort and page', () => {
    const parsed = parseSearchRequestParams(
      new URLSearchParams({ sort: 'foo', page: '0', q: '7353101' }),
    )
    expect(parsed.sort).toBe('relevance')
    expect(parsed.page).toBe(1)
    expect(parsed.q).toBe('7353101')
  })

  it('uses empty q when over max length', () => {
    const parsed = parseSearchRequestParams(new URLSearchParams({ q: 'x'.repeat(200) }))
    expect(parsed.q).toBe('')
  })
})
