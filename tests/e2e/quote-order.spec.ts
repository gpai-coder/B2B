import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { isLocalBaseUrl } from '../helpers/e2e-env'
import { loginVendor } from '../helpers/vendor-login'

test.describe('Quote order page', () => {
  test('shows a clear message when quote is not accepted', async ({ page, request }) => {
    test.skip(!isLocalBaseUrl(), 'Uses temp quotes; localhost CI only')

    const headers = await adminJwtHeaders(request)
    const companyRes = await request.get(
      `/api/companies?where[name][equals]=${encodeURIComponent('Pacific Plumbing Supply')}&limit=1`,
      { headers },
    )
    const companyBody = (await companyRes.json()) as { docs: Array<{ id: number }> }
    const companyId = companyBody.docs[0]?.id
    expect(companyId).toBeTruthy()

    const variantRes = await request.get(
      '/api/product-variants?where[sku][equals]=7353101.002&limit=1',
      { headers },
    )
    const variantBody = (await variantRes.json()) as { docs: Array<{ id: number; sku: string }> }
    const variant = variantBody.docs[0]
    expect(variant).toBeTruthy()

    const createRes = await request.post('/api/quotes', {
      headers,
      data: {
        company: companyId,
        status: 'draft',
        lines: [{ sku: variant!.sku, variant: variant!.id, quantity: 1, unitPrice: 10 }],
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const created = (await createRes.json()) as { doc: { id: number; quoteNumber: string } }
    const quoteId = created.doc.id
    const quoteNumber = created.doc.quoteNumber

    try {
      const sentRes = await request.patch(`/api/quotes/${quoteId}`, {
        headers,
        data: { status: 'sent' },
      })
      expect(sentRes.ok()).toBeTruthy()

      await loginVendor(page, `/quotes/${encodeURIComponent(quoteNumber)}/order`)
      await expect(page.getByTestId('quote-order-unavailable')).toHaveText(
        'This quote is not available for ordering.',
      )
      await expect(page.getByTestId('submit-quote-order')).toHaveCount(0)
    } finally {
      if (process.env.DATABASE_URL && isLocalBaseUrl()) {
        const { purgeTestQuoteById, destroyTestQuotePayload } = await import('../helpers/purge-test-quote')
        await purgeTestQuoteById(quoteId)
        await destroyTestQuotePayload()
      } else {
        await request.delete(`/api/quotes/${quoteId}`, { headers })
      }
    }
  })
})
