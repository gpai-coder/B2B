import { describe, it, expect } from 'vitest'

import { getCatalogMediaAuthFailure } from '@/access'
import type { User } from '@/payload-types'

const baseUser = { updatedAt: '', createdAt: '', collection: 'users' } as const

describe('catalog media auth', () => {
  it('requires authentication', () => {
    expect(getCatalogMediaAuthFailure(null)).toBe('unauthenticated')
  })

  it('allows approved vendor and staff', () => {
    expect(
      getCatalogMediaAuthFailure({
        ...baseUser,
        id: 1,
        role: 'vendor-buyer',
        approved: true,
        email: 'a@test',
      } as User),
    ).toBeNull()
    expect(
      getCatalogMediaAuthFailure({
        ...baseUser,
        id: 1,
        role: 'admin',
        email: 'a@test',
      } as User),
    ).toBeNull()
  })

  it('blocks pending vendor', () => {
    expect(
      getCatalogMediaAuthFailure({
        ...baseUser,
        id: 1,
        role: 'vendor-buyer',
        approved: false,
        email: 'b@test',
      } as User),
    ).toBe('forbidden')
  })
})
