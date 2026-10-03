import { describe, expect, it } from 'vitest'

import { parseSearchRequestParams } from '@/lib/search/validate'

describe('parseSearchRequestParams', () => {
  it('rejects overlong q at validation time', () => {
    expect(() =>
      parseSearchRequestParams(new URLSearchParams({ q: 'x'.repeat(200) })),
    ).toThrow()
  })
})
