import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { isLocalBaseUrl } from '../helpers/e2e-env'
import { purgeTestOrderById } from '../helpers/purge-test-order'

const shipTo = {
  name: 'REST Frozen',
  line1: '1 Main',
  city: 'SF',
  state: 'CA',
  postalCode: '94105',
  country: 'US',
}

test.describe('staff order frozen fields (REST)', () => {
  test('PATCH returns 400 when changing frozen PO on a submitted order', async ({ request }) => {
    test.skip(!isLocalBaseUrl(), 'localhost Payload REST only')
    test.skip(!process.env.DATABASE_URL, 'needs DATABASE_URL for test cleanup')

    const headers = await adminJwtHeaders(request)
    const companies = await request.get(
      '/api/companies?where[name][equals]=Pacific%20Plumbing%20Supply&limit=1&depth=0',
      { headers },
    )
    expect(companies.ok()).toBeTruthy()
    const companyId = ((await companies.json()) as { docs: Array<{ id: number }> }).docs[0]?.id
    expect(companyId).toBeTruthy()

    const stamp = Date.now()
    const createRes = await request.post('/api/orders', {
      headers,
      data: {
        company: companyId,
        status: 'submitted',
        orderNumber: `E2E-REST-FRZ-${stamp}`,
        poNumber: `PO-REST-FRZ-${stamp}`,
        shipTo,
        lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const orderId = ((await createRes.json()) as { doc: { id: number } }).doc.id

    try {
      const patch = await request.patch(`/api/orders/${orderId}`, {
        headers,
        data: { poNumber: `PO-HACK-${stamp}` },
      })
      expect(patch.status()).toBe(400)

      const fresh = await request.get(`/api/orders/${orderId}?depth=0`, { headers })
      expect(fresh.ok()).toBeTruthy()
      const body = (await fresh.json()) as { poNumber?: string }
      expect(body.poNumber).toBe(`PO-REST-FRZ-${stamp}`)
    } finally {
      await purgeTestOrderById(orderId)
    }
  })
})
