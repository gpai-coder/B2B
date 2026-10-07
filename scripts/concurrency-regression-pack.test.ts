import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const REQUIRED_INT_SPECS = [
  'tests/int/cart-concurrency.int.spec.ts',
  'tests/int/staff-quote-builder.int.spec.ts',
  'tests/int/quote-order.int.spec.ts',
  'tests/int/checkout-concurrency.int.spec.ts',
]

describe('concurrency regression pack', () => {
  it('documents locking policy', () => {
    expect(existsSync('docs/concurrency-locking.md')).toBe(true)
  })

  it('keeps integration specs for cart and quote races', () => {
    for (const file of REQUIRED_INT_SPECS) {
      expect(existsSync(file)).toBe(true)
    }
  })
})
