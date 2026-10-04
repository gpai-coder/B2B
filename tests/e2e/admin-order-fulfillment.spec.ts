import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { isLocalBaseUrl } from '../helpers/e2e-env'

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
  headers: Awaited<ReturnType<typeof adminJwtHeaders>>,
) {
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

async function pickStatus(page: import('@playwright/test').Page, label: string) {
  const field = page.locator('#field-status')
  await field.scrollIntoViewIfNeeded()
  await field.getByRole('combobox').click()
  const menu = page.locator('div.rs__menu')
  await expect(menu).toBeVisible()
  await menu.locator('.rs__option').filter({ hasText: label }).click()
}

async function saveOrderDocument(page: import('@playwright/test').Page, orderId: number) {
  const saveButton = page.getByRole('button', { name: /^save$/i })
  await expect(saveButton).toBeEnabled({ timeout: 20_000 })
  const patchDone = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes(`/api/orders/${orderId}`),
    { timeout: 60_000 },
  )
  await saveButton.click()
  const res = await patchDone
  expect(res.ok(), `order save failed: ${res.status()} ${await res.text()}`).toBeTruthy()
}

test.describe('admin order fulfillment (local staff UI)', () => {
  test('staff confirms then ships a submitted order', async ({ page, request }) => {
    test.setTimeout(180_000)
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
      await page.goto('/admin/login')
      await page.getByLabel(/^email/i).fill(adminEmail)
      await page.getByLabel(/^password/i).fill(adminPassword)
      await page.getByRole('button', { name: /^login$/i }).click()
      await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'))

      await page.goto(`/admin/collections/orders/${orderId}`)

      await pickStatus(page, 'Confirmed')
      await saveOrderDocument(page, orderId)
      await expect(page.locator('#field-status')).toContainText('Confirmed')

      await pickStatus(page, 'Shipped')
      await page.getByLabel(/^carrier/i).fill('UPS')
      await page.getByLabel(/^tracking number/i).fill(`1Z-E2E-${stamp}`)
      await saveOrderDocument(page, orderId)
      await expect(page.locator('#field-status')).toContainText('Shipped')

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
      await deleteOrderWithEvents(request, orderId, headers)
    }
  })
})
