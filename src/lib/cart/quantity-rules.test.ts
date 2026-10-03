import { describe, expect, it } from 'vitest'

import { validateOrderQuantity } from '@/lib/cart/quantity-rules'

describe('validateOrderQuantity', () => {
  it('enforces MOQ and case pack', () => {
    const rules = { moq: 6, orderMultiple: 6 }
    expect(validateOrderQuantity(5, rules)).toMatch(/Minimum/)
    expect(validateOrderQuantity(7, rules)).toMatch(/multiples/)
    expect(validateOrderQuantity(12, rules)).toBeNull()
  })
})
