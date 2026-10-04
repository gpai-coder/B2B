import { describe, expect, it } from 'vitest'

import { linesSemanticallyEqual, shipToSemanticallyEqual } from './order-frozen-compare'

describe('order frozen semantic compare', () => {
  const shipTo = {
    name: 'Test',
    line1: '1 Main',
    line2: null as string | null,
    city: 'SF',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
  }

  it('treats null, undefined and empty line2 as equal', () => {
    expect(shipToSemanticallyEqual(shipTo, { ...shipTo, line2: '' })).toBe(true)
    expect(shipToSemanticallyEqual(shipTo, { ...shipTo, line2: undefined })).toBe(true)
    const withoutLine2 = { ...shipTo }
    delete (withoutLine2 as { line2?: string }).line2
    expect(shipToSemanticallyEqual(shipTo, withoutLine2)).toBe(true)
  })

  it('rejects shipTo null', () => {
    expect(shipToSemanticallyEqual(shipTo, null)).toBe(false)
  })

  it('ignores line ids and key order', () => {
    const locked = [{ id: 'abc', sku: '7353101.002', quantity: 1, unitPrice: 10, variant: 5 }]
    const next = [{ sku: '7353101.002', unitPrice: 10, quantity: 1, variant: 5 }]
    expect(linesSemanticallyEqual(locked, next)).toBe(true)
    expect(
      linesSemanticallyEqual(locked, [{ sku: '7353101.002', quantity: 1, unitPrice: 10, variant: 5 }]),
    ).toBe(true)
  })
})
