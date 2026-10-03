import { describe, expect, it } from 'vitest'

import {
  mergeQuickOrderLines,
  normalizeQuickOrderSku,
  parseQuickOrderCsv,
  parseQuickOrderPaste,
  QuickOrderParseError,
} from '@/lib/quick-order/parse-input'
import { QUICK_ORDER_MAX_BYTES } from '@/lib/quick-order/limits'

describe('parseQuickOrderPaste', () => {
  it('parses space, tab, and comma separated lines', () => {
    expect(parseQuickOrderPaste('7353101.002 2\n2034314.020\t6\nfoo,3')).toEqual([
      { lineNumber: 1, sku: '7353101.002', quantity: 2 },
      { lineNumber: 2, sku: '2034314.020', quantity: 6 },
      { lineNumber: 3, sku: 'foo', quantity: 3 },
    ])
  })

  it('treats formula-like SKU text literally', () => {
    const lines = parseQuickOrderPaste('=cmd|calc 1\n+1234 2\n@evil 3')
    expect(lines.map((l) => l.sku)).toEqual(['=cmd|calc', '+1234', '@evil'])
  })

  it('merges duplicate SKUs', () => {
    const merged = mergeQuickOrderLines([
      { lineNumber: 1, sku: 'A', quantity: 2 },
      { lineNumber: 2, sku: 'a', quantity: 3 },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.quantity).toBe(5)
  })
})

describe('parseQuickOrderCsv', () => {
  it('handles BOM, CRLF, optional header, and quoted fields', () => {
    const raw = '\uFEFFsku,qty\r\n"7353101.002",2\r\n"=quoted,sku",3'
    expect(parseQuickOrderCsv(raw)).toEqual([
      { lineNumber: 2, sku: '7353101.002', quantity: 2 },
      { lineNumber: 3, sku: '=quoted,sku', quantity: 3 },
    ])
  })

  it('rejects oversize input', () => {
    const big = 'a 1\n'.repeat(QUICK_ORDER_MAX_BYTES)
    expect(() => parseQuickOrderPaste(big)).toThrow(/bytes/)
  })

  it('throws on bad quantity', () => {
    expect(() => parseQuickOrderPaste('7353101.002 1.5')).toThrow(QuickOrderParseError)
  })
})

describe('normalizeQuickOrderSku', () => {
  it('trims without altering special chars', () => {
    expect(normalizeQuickOrderSku('  -SKU.1  ')).toBe('-SKU.1')
  })
})
