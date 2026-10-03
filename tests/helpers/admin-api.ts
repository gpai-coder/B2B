import type { APIRequestContext } from '@playwright/test'

import {
  isSmokeSweepMediaAlt,
  isSmokeSweepProductSlug,
  isSmokeSweepVariantSku,
} from './smoke-artifact-matchers'

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

type Paginated<T> = {
  docs: T[]
  totalPages?: number
  page?: number
}

async function fetchAllPages<T>(
  request: APIRequestContext,
  basePath: string,
  headers: Awaited<ReturnType<typeof adminJwtHeaders>>,
): Promise<T[]> {
  const docs: T[] = []
  let page = 1
  for (;;) {
    const sep = basePath.includes('?') ? '&' : '?'
    const res = await request.get(`${basePath}${sep}page=${page}&limit=100`, { headers })
    if (!res.ok()) {
      const body = await res.text()
      throw new Error(`Smoke sweep list failed (${basePath} page ${page}): ${res.status()} ${body}`)
    }
    const body = (await res.json()) as Paginated<T>
    docs.push(...(body.docs ?? []))
    const totalPages = body.totalPages ?? 1
    if (page >= totalPages || !body.docs?.length) break
    page++
  }
  return docs
}

function variantIdFromLine(variant: unknown): number | undefined {
  if (variant == null) return undefined
  if (typeof variant === 'object') return (variant as { id: number }).id
  return Number(variant)
}

export async function sweepSmokeTestArtifacts(request: APIRequestContext) {
  const headers = await adminJwtHeaders(request)
  const failures: string[] = []

  const record = async (
    label: string,
    res: { ok: () => boolean; status: () => number; text: () => Promise<string> },
  ) => {
    if (res.ok()) return
    failures.push(`${label}: ${res.status()} ${await res.text()}`)
  }

  const productDocs = await fetchAllPages<{ id: number; slug?: string | null }>(
    request,
    '/api/products?where[slug][like]=smoke-&depth=0',
    headers,
  )
  const productIds = productDocs.filter((d) => isSmokeSweepProductSlug(d.slug)).map((d) => d.id)

  const variantDocs = await fetchAllPages<{ id: number; sku?: string | null }>(
    request,
    '/api/product-variants?where[sku][like]=smoke-&depth=0',
    headers,
  )
  const variantIds = new Set(
    variantDocs.filter((d) => isSmokeSweepVariantSku(d.sku)).map((d) => d.id),
  )

  const mediaDocs = await fetchAllPages<{ id: number; alt?: string | null }>(
    request,
    '/api/media?where[alt][like]=Spec smoke-&depth=0',
    headers,
  )
  const mediaIds = mediaDocs.filter((d) => isSmokeSweepMediaAlt(d.alt)).map((d) => d.id)

  if (variantIds.size > 0) {
    const priceLists = await fetchAllPages<{
      id: number
      lines?: Array<{ variant?: unknown }>
    }>(request, '/api/price-lists?depth=1', headers)

    for (const list of priceLists) {
      const lines = list.lines ?? []
      const remaining = lines.filter((line) => {
        const vid = variantIdFromLine(line.variant)
        return vid == null || !variantIds.has(vid)
      })
      if (remaining.length === lines.length) continue
      await record(
        `PATCH price-list ${list.id} remove smoke lines`,
        await request.patch(`/api/price-lists/${list.id}`, {
          headers,
          data: { lines: remaining },
        }),
      )
    }
  }

  for (const id of variantIds) {
    await record(
      `DELETE product-variant ${id}`,
      await request.delete(`/api/product-variants/${id}`, { headers }),
    )
  }

  for (const id of productIds) {
    await record(`DELETE product ${id}`, await request.delete(`/api/products/${id}`, { headers }))
  }

  for (const id of mediaIds) {
    await record(`DELETE media ${id}`, await request.delete(`/api/media/${id}`, { headers }))
  }

  if (failures.length > 0) {
    throw new Error(`Smoke sweep failed:\n${failures.join('\n')}`)
  }
}

export type QuoteRestoreSnapshot = {
  status?: string
  expiresAt?: string
  convertedOrder: number | null
}

export type QuoteRestoreState = {
  quoteId: number
  snapshot: QuoteRestoreSnapshot
}

export async function fetchSeedQuote(request: APIRequestContext, quoteNumber: string) {
  const headers = await adminJwtHeaders(request)
  const res = await request.get(
    `/api/quotes?where[quoteNumber][equals]=${encodeURIComponent(quoteNumber)}&limit=1&depth=0`,
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

export async function restoreQuote(
  request: APIRequestContext,
  holder: { restore: QuoteRestoreState | null },
): Promise<void> {
  const pending = holder.restore
  if (!pending) return
  const headers = await adminJwtHeaders(request)
  const res = await request.patch(`/api/quotes/${pending.quoteId}`, {
    headers,
    data: pending.snapshot,
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Quote restore failed: ${res.status()} ${body}`)
  }
  holder.restore = null
}
