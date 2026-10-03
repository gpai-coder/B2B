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

const SMOKE_SLUG_PREFIX = 'smoke-'

export async function sweepSmokeTestArtifacts(request: APIRequestContext) {
  const headers = await adminJwtHeaders(request)

  const products = await request.get(
    `/api/products?where[slug][like]=${encodeURIComponent(SMOKE_SLUG_PREFIX)}&limit=50`,
    { headers },
  )
  if (products.ok()) {
    const body = (await products.json()) as { docs: Array<{ id: number }> }
    for (const doc of body.docs) {
      await request.delete(`/api/products/${doc.id}`, { headers }).catch(() => undefined)
    }
  }

  const variants = await request.get(
    `/api/product-variants?where[sku][like]=${encodeURIComponent(SMOKE_SLUG_PREFIX)}&limit=50`,
    { headers },
  )
  if (variants.ok()) {
    const body = (await variants.json()) as { docs: Array<{ id: number }> }
    for (const doc of body.docs) {
      await request.delete(`/api/product-variants/${doc.id}`, { headers }).catch(() => undefined)
    }
  }

  const media = await request.get(`/api/media?limit=100`, { headers })
  if (media.ok()) {
    const body = (await media.json()) as { docs: Array<{ id: number; alt?: string | null }> }
    for (const doc of body.docs) {
      if (doc.alt?.startsWith('Spec smoke-')) {
        await request.delete(`/api/media/${doc.id}`, { headers }).catch(() => undefined)
      }
    }
  }
}

export async function fetchSeedQuote(request: APIRequestContext, quoteNumber: string) {
  const headers = await adminJwtHeaders(request)
  const res = await request.get(
    `/api/quotes?where[quoteNumber][equals]=${encodeURIComponent(quoteNumber)}&limit=1`,
    { headers },
  )
  if (!res.ok()) throw new Error(`Could not load quote ${quoteNumber}: ${res.status()}`)
  const body = (await res.json()) as {
    docs: Array<{
      id: number
      status?: string
      expiresAt?: string
      convertedOrder?: number | { id: number } | null
    }>
  }
  const doc = body.docs[0]
  if (!doc) throw new Error(`Quote ${quoteNumber} not found`)
  return { headers, doc }
}

export async function patchQuote(
  request: APIRequestContext,
  quoteId: number,
  data: Record<string, unknown>,
  headers?: Awaited<ReturnType<typeof adminJwtHeaders>>,
) {
  const h = headers ?? (await adminJwtHeaders(request))
  return request.patch(`/api/quotes/${quoteId}`, { headers: h, data })
}
