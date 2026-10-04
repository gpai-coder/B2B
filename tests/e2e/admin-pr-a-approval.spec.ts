import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { isLocalBaseUrl } from '../helpers/e2e-env'

const E2E_EMAIL_PREFIX = 'e2e-vendor-appr-zz'
const E2E_EMAIL_RE = /^e2e-vendor-appr-zz\d{13}@local\.test$/

async function sweepTempVendorUsers(request: import('@playwright/test').APIRequestContext) {
  const headers = await adminJwtHeaders(request)
  const res = await request.get(
    `/api/users?where[email][like]=${encodeURIComponent(E2E_EMAIL_PREFIX)}&limit=100&depth=0`,
    { headers },
  )
  if (!res.ok()) return
  const body = (await res.json()) as { docs: Array<{ id: number; email?: string }> }
  for (const doc of body.docs) {
    if (!doc.email || !E2E_EMAIL_RE.test(doc.email)) continue
    await request.delete(`/api/users/${doc.id}`, { headers })
  }
}

async function sweepTempCompanies(request: import('@playwright/test').APIRequestContext) {
  const headers = await adminJwtHeaders(request)
  const res = await request.get(
    '/api/companies?where[name][like]=e2e-vendor-appr-co-zz&limit=100&depth=0',
    { headers },
  )
  if (!res.ok()) return
  const body = (await res.json()) as { docs: Array<{ id: number; name?: string }> }
  for (const doc of body.docs) {
    if (!doc.name?.startsWith('e2e-vendor-appr-co-zz')) continue
    await request.delete(`/api/companies/${doc.id}`, { headers })
  }
}

async function createApprovedVendor(request: import('@playwright/test').APIRequestContext) {
  const stamp = Date.now()
  const email = `${E2E_EMAIL_PREFIX}${stamp}@local.test`
  const password = 'local-dev-vendor-password'
  const headers = await adminJwtHeaders(request)

  const companyRes = await request.post('/api/companies', {
    headers,
    data: { name: `e2e-vendor-appr-co-zz${stamp}`, accountApproved: true },
  })
  expect(companyRes.ok()).toBeTruthy()
  const company = (await companyRes.json()) as { doc: { id: number } }

  const userRes = await request.post('/api/users', {
    headers,
    data: {
      email,
      password,
      role: 'vendor-buyer',
      company: company.doc.id,
      approved: true,
      approvalStatus: 'approved',
    },
  })
  expect(userRes.ok()).toBeTruthy()
  const userBody = (await userRes.json()) as { doc: { id: number } }

  const loginRes = await request.post('/api/users/login', {
    data: { email, password },
  })
  expect(loginRes.ok()).toBeTruthy()
  const loginBody = (await loginRes.json()) as { token?: string }
  const token = loginBody.token
  expect(token).toBeTruthy()

  return {
    stamp,
    email,
    password,
    token: token!,
    userId: userBody.doc.id,
    companyId: company.doc.id,
    authHeaders: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' },
    adminHeaders: headers,
  }
}

test.describe('vendor approval on next request (prod-safe temp users)', () => {
  test.afterAll(async ({ request }) => {
    await sweepTempVendorUsers(request)
    await sweepTempCompanies(request)
  })

  test('rejection blocks the next REST read while JWT is still valid', async ({ request }) => {
    test.skip(!isLocalBaseUrl(), 'Uses temp users via admin REST; localhost CI only')

    const vendor = await createApprovedVendor(request)

    const beforeOrders = await request.get('/api/orders?limit=1', { headers: vendor.authHeaders })
    expect(beforeOrders.ok()).toBeTruthy()

    const rejectRes = await request.post(`/api/users/${vendor.userId}/reject`, {
      headers: vendor.adminHeaders,
    })
    expect(rejectRes.ok()).toBeTruthy()

    const afterOrders = await request.get('/api/orders?limit=1', { headers: vendor.authHeaders })
    expect(afterOrders.ok()).toBe(false)

    const afterProducts = await request.get('/api/products?limit=1', { headers: vendor.authHeaders })
    expect(afterProducts.ok()).toBe(false)

    const afterCarts = await request.get('/api/carts?limit=1', { headers: vendor.authHeaders })
    expect(afterCarts.ok()).toBe(false)

    await request.delete(`/api/users/${vendor.userId}`, { headers: vendor.adminHeaders })
    await request.delete(`/api/companies/${vendor.companyId}`, { headers: vendor.adminHeaders })
  })

  test('rejection redirects catalog and cart pages away from commerce', async ({ page, request }) => {
    test.skip(!isLocalBaseUrl(), 'Uses temp users via admin REST; localhost CI only')

    const vendor = await createApprovedVendor(request)

    const { loginVendor } = await import('../helpers/vendor-login')
    await loginVendor(page, '/catalog', { email: vendor.email, password: vendor.password })

    await request.post(`/api/users/${vendor.userId}/reject`, { headers: vendor.adminHeaders })

    await page.goto('/catalog')
    await expect(page).toHaveURL(/\/account/)

    await page.goto('/cart')
    await expect(page).toHaveURL(/\/account/)

    await request.delete(`/api/users/${vendor.userId}`, { headers: vendor.adminHeaders })
    await request.delete(`/api/companies/${vendor.companyId}`, { headers: vendor.adminHeaders })
  })
})
