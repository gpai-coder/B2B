import { describe, expect, it } from 'vitest'

import { MAX_CART_QUANTITY, parseCartQuantity, validateOrderQuantity } from '@/lib/cart/quantity-rules'

describe('parseCartQuantity', () => {
  it('rejects non-integers and out-of-range values', () => {
    expect(parseCartQuantity(10.5).ok).toBe(false)
    expect(parseCartQuantity(1e12).ok).toBe(false)
    expect(parseCartQuantity(-3).ok).toBe(false)
    expect(parseCartQuantity(0).ok).toBe(false)
    expect(parseCartQuantity(MAX_CART_QUANTITY).ok).toBe(true)
    expect(parseCartQuantity(MAX_CART_QUANTITY + 1).ok).toBe(false)
  })
})

describe('validateOrderQuantity', () => {
  it('enforces MOQ and case pack', () => {
    const rules = { moq: 6, orderMultiple: 6 }
    expect(validateOrderQuantity(5, rules)).toMatch(/Minimum/)
    expect(validateOrderQuantity(7, rules)).toMatch(/multiples/)
    expect(validateOrderQuantity(12, rules)).toBeNull()
    expect(validateOrderQuantity(10.5, rules)).toMatch(/whole number/)
  })
})
