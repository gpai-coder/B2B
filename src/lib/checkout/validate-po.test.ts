import { describe, expect, it } from 'vitest'

import { validatePoNumber } from '@/lib/checkout/validate-po'

describe('validatePoNumber', () => {
  it('requires non-empty trimmed PO', () => {
    expect(validatePoNumber('  ')).toEqual({ ok: false, error: 'PO number is required.' })
    expect(validatePoNumber(' PO-1 ')).toEqual({ ok: true, poNumber: 'PO-1' })
  })

  it('rejects PO longer than 35 characters', () => {
    expect(validatePoNumber('a'.repeat(36)).ok).toBe(false)
    expect(validatePoNumber('a'.repeat(35)).ok).toBe(true)
  })
})
