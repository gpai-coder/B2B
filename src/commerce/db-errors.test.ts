import { describe, expect, it } from 'vitest'

import { isUniqueViolation } from '@/commerce/db-errors'

describe('isUniqueViolation', () => {
  it('detects postgres code on error or cause', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true)
  })

  it('detects Payload ValidationError unique messages', () => {
    expect(
      isUniqueViolation({
        data: { errors: [{ message: 'Value must be unique' }] },
      }),
    ).toBe(true)
  })
})
