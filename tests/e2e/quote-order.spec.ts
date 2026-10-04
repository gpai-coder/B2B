import { test, expect } from '@playwright/test'

import {
  adminJwtHeaders,
  restoreQuote,
  type QuoteRestoreState,
} from '../helpers/admin-api'
import { loginVendor } from '../helpers/vendor-login'

const SEED_QUOTE_NUMBER = 'Q-2026-0001'

test.describe('Quote order page', () => {
  const quoteRestoreHolder: { restore: QuoteRestoreState | null } = { restore: null }

  test.afterAll(async ({ request }) => {
    await restoreQuote(request, quoteRestoreHolder)
  })

  test('shows a clear message when quote is not accepted', async ({ page, request }) => {
    const headers = await adminJwtHeaders(request)
    const quoteRes = await request.get(
      `/api/quotes?where[quoteNumber][equals]=${encodeURIComponent(SEED_QUOTE_NUMBER)}&limit=1&depth=0`,
      { headers },
    )
    expect(quoteRes.ok()).toBeTruthy()
    const quoteBody = (await quoteRes.json()) as {
      docs: Array<{ id: number; status?: string; expiresAt?: string; convertedOrder?: number | null }>
    }
    const quote = quoteBody.docs[0]
    expect(quote).toBeTruthy()

    quoteRestoreHolder.restore = {
      quoteId: quote!.id,
      snapshot: {
        status: quote!.status,
        expiresAt: quote!.expiresAt,
        convertedOrder: quote!.convertedOrder ?? null,
      },
    }

    try {
      const patch = await request.patch(`/api/quotes/${quote!.id}`, {
        headers,
        data: { status: 'expired', convertedOrder: null },
      })
      expect(patch.ok()).toBeTruthy()

      await loginVendor(page, `/quotes/${SEED_QUOTE_NUMBER}/order`)
      await expect(page.getByTestId('quote-order-unavailable')).toHaveText(
        'This quote is not available for ordering.',
      )
      await expect(page.getByTestId('submit-quote-order')).toHaveCount(0)
    } finally {
      try {
        await restoreQuote(request, quoteRestoreHolder)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/Target page, context or browser has been closed|Request context disposed/i.test(msg)) {
          throw err
        }
      }
    }
  })
})
