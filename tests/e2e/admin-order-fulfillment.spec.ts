import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { isLocalBaseUrl } from '../helpers/e2e-env'
import { login } from '../helpers/login'

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'

const shipTo = {
  name: 'E2E Fulfillment',
  line1: '100 Ship St',
  city: 'SF',
  state: 'CA',
  postalCode: '94105',
  country: 'US',
}

async function deleteOrderWithEvents(
  request: import('@playwright/test').APIRequestContext,
  orderId: number,
) {
  const headers = await adminJwtHeaders(request)
  const events = await request.get(
    `/api/order-events?where[order][equals]=${orderId}&limit=50&depth=0`,
    { headers },
  )
  if (events.ok()) {
    const body = (await events.json()) as { docs: Array<{ id: number }> }
    for (const row of body.docs) {
      await request.delete(`/api/order-events/${row.id}`, { headers })
    }
  }
  await request.delete(`/api/orders/${orderId}`, { headers })
}

test.describe('admin order fulfillment (local staff UI)', () => {
  test('staff confirms then ships a submitted order', async ({ page, request }) => {
    test.skip(!isLocalBaseUrl(), 'Uses admin UI against local Payload; localhost CI only')

    const headers = await adminJwtHeaders(request)
    const companies = await request.get(
      '/api/companies?where[name][equals]=Pacific%20Plumbing%20Supply&limit=1&depth=0',
      { headers },
    )
    expect(companies.ok()).toBeTruthy()
    const companyBody = (await companies.json()) as { docs: Array<{ id: number }> }
    const companyId = companyBody.docs[0]?.id
    expect(companyId).toBeTruthy()

    const stamp = Date.now()
    const createRes = await request.post('/api/orders', {
      headers,
      data: {
        company: companyId,
        status: 'submitted',
        orderNumber: `E2E-FUL-${stamp}`,
        poNumber: `PO-E2E-FUL-${stamp}`,
        shipTo,
        lines: [{ sku: '7353101.002', quantity: 1, unitPrice: 10 }],
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const order = (await createRes.json()) as { doc: { id: number } }
    const orderId = order.doc.id

    try {
      await login({ page, user: { email: adminEmail, password: adminPassword } })
      await page.goto(`/admin/collections/orders/${orderId}`)

      await page.locator('#field-status').selectOption('confirmed')
      await page.getByRole('button', { name: /^save$/i }).click()
      await expect(page.locator('#field-status')).toHaveValue('confirmed')

      await page.locator('#field-status').selectOption('shipped')
      await page.locator('#field-carrier').fill('UPS')
      await page.locator('#field-trackingNumber').fill(`1Z-E2E-${stamp}`)
      await page.getByRole('button', { name: /^save$/i }).click()
      await expect(page.locator('#field-status')).toHaveValue('shipped')

      const fresh = await request.get(`/api/orders/${orderId}?depth=0`, { headers })
      expect(fresh.ok()).toBeTruthy()
      const freshBody = (await fresh.json()) as {
        status?: string
        carrier?: string
        trackingNumber?: string
      }
      expect(freshBody.status).toBe('shipped')
      expect(freshBody.carrier).toBe('UPS')
      expect(freshBody.trackingNumber).toBe(`1Z-E2E-${stamp}`)

      const eventsRes = await request.get(
        `/api/order-events?where[order][equals]=${orderId}&sort=createdAt&limit=10&depth=0`,
        { headers },
      )
      expect(eventsRes.ok()).toBeTruthy()
      const eventsBody = (await eventsRes.json()) as {
        docs: Array<{ fromStatus?: string; toStatus?: string }>
      }
      expect(eventsBody.docs.map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
        'submitted->confirmed',
        'confirmed->shipped',
      ])
    } finally {
      await deleteOrderWithEvents(request, orderId)
    }
  })
})
