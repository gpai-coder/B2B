import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { isLocalBaseUrl } from '../helpers/e2e-env'

test.describe('Staff quote builder e2e', () => {
  test('staff creates a temp quote visible to vendor after send', async ({ request }) => {
    test.skip(!isLocalBaseUrl(), 'Prod-safe: runs only against localhost')
    const headers = await adminJwtHeaders(request)
    const companies = await request.get('/api/companies?limit=1', { headers })
    expect(companies.ok()).toBeTruthy()
    const companyBody = (await companies.json()) as { docs: Array<{ id: number }> }
    const companyId = companyBody.docs[0]?.id
    expect(companyId).toBeTruthy()

    const variants = await request.get(
      '/api/product-variants?where[sku][equals]=7353101.002&limit=1',
      { headers },
    )
    const variantBody = (await variants.json()) as { docs: Array<{ id: number; sku: string }> }
    const variant = variantBody.docs[0]
    expect(variant).toBeTruthy()

    const stamp = Date.now()
    const createRes = await request.post('/api/quotes', {
      headers,
      data: {
        company: companyId,
        status: 'draft',
        notes: `e2e-staff-quote-${stamp}`,
        lines: [{ sku: variant!.sku, variant: variant!.id, quantity: 2, unitPrice: 12.5 }],
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const created = (await createRes.json()) as { doc: { id: number; quoteNumber: string } }
    const quoteId = created.doc.id
    const quoteNumber = created.doc.quoteNumber

    try {
      expect(quoteNumber).toMatch(/^Q-\d{4}-\d{6}$/)
      expect(quoteNumber).not.toBe('Q-2026-0001')

      const sentRes = await request.patch(`/api/quotes/${quoteId}`, {
        headers,
        data: { status: 'sent' },
      })
      expect(sentRes.ok()).toBeTruthy()

      const vendorLogin = await request.post('/api/users/login', {
        data: {
          email: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local',
          password: process.env.SEED_VENDOR_PASSWORD ?? 'local-dev-vendor-password',
        },
      })
      expect(vendorLogin.ok()).toBeTruthy()
      const vendorToken = (await vendorLogin.json()) as { token?: string }
      expect(vendorToken.token).toBeTruthy()
      const vendorHeaders = { Authorization: `JWT ${vendorToken.token}` }

      const vendorList = await request.get('/api/quotes?limit=50', { headers: vendorHeaders })
      expect(vendorList.ok()).toBeTruthy()
      const listBody = (await vendorList.json()) as { docs: Array<{ quoteNumber: string }> }
      expect(listBody.docs.some((q) => q.quoteNumber === quoteNumber)).toBe(true)
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
