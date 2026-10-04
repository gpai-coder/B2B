// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/orders/payload-transaction', () => ({
  withPayloadTransaction: async (_p: unknown, _r: unknown, fn: () => Promise<unknown>) => fn(),
}))

import { runBoundedUniqueRetry } from '@/lib/db/bounded-unique-retry'

describe('bounded unique retry', () => {
  it('retries until success', async () => {
    const payload = {} as import('payload').Payload
    const req = {} as import('payload').PayloadRequest
    let calls = 0
    const result = await runBoundedUniqueRetry(
      payload,
      req,
      async () => {
        calls += 1
        if (calls < 3) throw { cause: { code: '23505' } }
        return 'ok'
      },
      {
        maxAttempts: 5,
        isCollision: (err) => (err as { cause?: { code?: string } }).cause?.code === '23505',
      },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('throws after max attempts', async () => {
    const payload = {} as import('payload').Payload
    const req = {} as import('payload').PayloadRequest
    await expect(
      runBoundedUniqueRetry(
        payload,
        req,
        async () => {
          throw { cause: { code: '23505' } }
        },
        {
          maxAttempts: 2,
          isCollision: () => true,
        },
      ),
    ).rejects.toEqual({ cause: { code: '23505' } })
  })
})

describe('quote and order number collision detectors', () => {
  it('detects quote number unique violations', async () => {
    const { isQuoteNumberCollision } = await import('@/lib/quotes/allocate-quote-number')
    expect(
      isQuoteNumberCollision({ code: '23505', cause: { constraint: 'quotes_quote_number_idx' } }),
    ).toBe(true)
    expect(isQuoteNumberCollision(new Error('nope'))).toBe(false)
  })

  it('detects order number unique violations', async () => {
    const { isOrderNumberCollision } = await import('@/lib/orders/allocate-order-number')
    expect(
      isOrderNumberCollision({ code: '23505', cause: { constraint: 'orders_order_number_idx' } }),
    ).toBe(true)
    expect(isOrderNumberCollision(new Error('other'))).toBe(false)
  })
})
