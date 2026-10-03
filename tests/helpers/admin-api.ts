import type { APIRequestContext } from '@playwright/test'

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'

export async function adminJwtHeaders(request: APIRequestContext) {
  const loginRes = await request.post('/api/users/login', {
    data: { email: adminEmail, password: adminPassword },
  })
  if (!loginRes.ok()) {
    throw new Error(`Admin login failed: ${loginRes.status()}`)
  }
  const body = (await loginRes.json()) as { token?: string }
  if (!body.token) throw new Error('Admin login did not return a token')
  return {
    Authorization: `JWT ${body.token}`,
    'Content-Type': 'application/json',
  } as const
}

export async function deleteCartBulkAddsByKey(request: APIRequestContext, idempotencyKey: string) {
  const headers = await adminJwtHeaders(request)
  const rows = await request.get(
    `/api/cart-bulk-adds?where[idempotencyKey][equals]=${encodeURIComponent(idempotencyKey)}&limit=10`,
    { headers },
  )
  if (!rows.ok()) return
  const body = (await rows.json()) as { docs: Array<{ id: number }> }
  for (const doc of body.docs) {
    await request.delete(`/api/cart-bulk-adds/${doc.id}`, { headers })
  }
}

export async function deleteOrderById(request: APIRequestContext, orderId: string) {
  const headers = await adminJwtHeaders(request)
  await request.delete(`/api/orders/${orderId}`, { headers })
}

export async function deleteOrdersByPo(request: APIRequestContext, poNumber: string) {
  const headers = await adminJwtHeaders(request)
  const rows = await request.get(
    `/api/orders?where[poNumber][equals]=${encodeURIComponent(poNumber)}&limit=20`,
    { headers },
  )
  if (!rows.ok()) return
  const body = (await rows.json()) as { docs: Array<{ id: number }> }
  for (const doc of body.docs) {
    await request.delete(`/api/orders/${doc.id}`, { headers })
  }
}
