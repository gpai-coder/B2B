import { test, expect } from '@playwright/test'

const vendorEmail = process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local'
const vendorPassword = process.env.SEED_VENDOR_A_PASSWORD ?? 'local-dev-vendor-a-password'

test.describe('vendor order REST access', () => {
  test('vendor cannot POST or PATCH orders via Payload REST', async ({ request }) => {
    const loginRes = await request.post('/api/users/login', {
      data: { email: vendorEmail, password: vendorPassword },
    })
    expect(loginRes.ok()).toBeTruthy()
    const loginBody = (await loginRes.json()) as { token?: string; user?: { id: number } }
    const token = loginBody.token
    expect(token).toBeTruthy()

    const authHeaders = {
      Authorization: `JWT ${token}`,
      'Content-Type': 'application/json',
    }

    const createRes = await request.post('/api/orders', {
      headers: authHeaders,
      data: {
        company: 1,
        status: 'draft',
        shipTo: {
          name: 'Pacific',
          line1: '1 Main',
          city: 'SF',
          state: 'CA',
          postalCode: '94105',
          country: 'US',
        },
        lines: [{ sku: 'LIX-FCT-1001', quantity: 1, unitPrice: 0 }],
      },
    })
    expect(createRes.ok()).toBe(false)

    const ordersRes = await request.get('/api/orders?limit=1', { headers: authHeaders })
    expect(ordersRes.ok()).toBeTruthy()
    const ordersBody = (await ordersRes.json()) as { docs: Array<{ id: number }> }
    const orderId = ordersBody.docs[0]?.id
    test.skip(!orderId, 'No seeded order visible to vendor')

    const patchStatus = await request.patch(`/api/orders/${orderId}`, {
      headers: authHeaders,
      data: { status: 'shipped' },
    })
    expect(patchStatus.ok()).toBe(false)

    const patchPrice = await request.patch(`/api/orders/${orderId}`, {
      headers: authHeaders,
      data: {
        lines: [{ sku: 'LIX-FCT-1001', quantity: 1, unitPrice: 0 }],
      },
    })
    expect(patchPrice.ok()).toBe(false)
  })
})
