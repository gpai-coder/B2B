import { test, expect } from '@playwright/test'

import { adminJwtHeaders, createSmokeMedia, sweepSmokeTestArtifacts } from '../helpers/admin-api'

const PACIFIC_CONTRACT_LIST = 'Pacific Plumbing Contract 2026'
const DECOY_VARIANT_SKU = 'AS-SMOKE-GLASS-01'
const DECOY_PRODUCT_SLUG = 'frosted-smoke-glass-shower-panel'
const SMOKE_RUN_MS = '1735923456789'

test.describe('smoke artifact sweep', () => {
  test('removes strict smoke markers but not decoy catalog rows', async ({ request }) => {
    const headers = await adminJwtHeaders(request)
    const smokeSlug = `smoke-${SMOKE_RUN_MS}-faucet`
    const smokeSku = `smoke-${SMOKE_RUN_MS}-sku`
    const smokeAlt = `Spec ${smokeSku}`

    let decoyProductId: number | undefined
    let decoyVariantId: number | undefined
    let smokeProductId: number | undefined
    let smokeVariantId: number | undefined
    let smokeMediaId: number | undefined
    let pacificListId: number | undefined

    try {
      const decoyProductRes = await request.post('/api/products', {
        headers,
        data: {
          name: 'Frosted Smoke Glass Panel',
          slug: DECOY_PRODUCT_SLUG,
          productCollection: 'Showers',
        },
      })
      if (decoyProductRes.ok()) {
        const body = (await decoyProductRes.json()) as { doc: { id: number } }
        decoyProductId = body.doc.id
      } else {
        const existing = await request.get(
          `/api/products?where[slug][equals]=${encodeURIComponent(DECOY_PRODUCT_SLUG)}&limit=1&depth=0`,
          { headers },
        )
        const existingBody = (await existing.json()) as { docs: Array<{ id: number }> }
        decoyProductId = existingBody.docs[0]?.id
      }
      expect(decoyProductId).toBeTruthy()

      const decoyVariantLookup = await request.get(
        `/api/product-variants?where[sku][equals]=${encodeURIComponent(DECOY_VARIANT_SKU)}&limit=1&depth=0`,
        { headers },
      )
      const decoyVariantBody = (await decoyVariantLookup.json()) as { docs: Array<{ id: number }> }
      if (decoyVariantBody.docs[0]) {
        decoyVariantId = decoyVariantBody.docs[0].id
      } else {
        const decoyVariantRes = await request.post('/api/product-variants', {
          headers,
          data: {
            sku: DECOY_VARIANT_SKU,
            name: 'AS Smoke Glass',
            product: decoyProductId,
            finish: 'Clear',
          },
        })
        expect(decoyVariantRes.ok()).toBeTruthy()
        decoyVariantId = ((await decoyVariantRes.json()) as { doc: { id: number } }).doc.id
      }

      const smokeProductRes = await request.post('/api/products', {
        headers,
        data: {
          name: 'Sweep Test Faucet',
          slug: smokeSlug,
          productCollection: 'Faucets',
        },
      })
      expect(smokeProductRes.ok()).toBeTruthy()
      smokeProductId = ((await smokeProductRes.json()) as { doc: { id: number } }).doc.id

      const smokeVariantRes = await request.post('/api/product-variants', {
        headers,
        data: {
          sku: smokeSku,
          name: 'Sweep Test Chrome',
          product: smokeProductId,
          finish: 'Chrome',
        },
      })
      expect(smokeVariantRes.ok()).toBeTruthy()
      smokeVariantId = ((await smokeVariantRes.json()) as { doc: { id: number } }).doc.id

      const listsRes = await request.get('/api/price-lists?where[kind][equals]=company&limit=20&depth=1', {
        headers,
      })
      expect(listsRes.ok()).toBeTruthy()
      const listsBody = (await listsRes.json()) as {
        docs: Array<{ id: number; name?: string; lines?: Array<{ variant?: number | { id: number } }> }>
      }
      const pacificList = listsBody.docs.find((d) => d.name === PACIFIC_CONTRACT_LIST)
      expect(pacificList).toBeTruthy()
      pacificListId = pacificList!.id

      const patchList = await request.patch(`/api/price-lists/${pacificListId}`, {
        headers,
        data: {
          lines: [
            ...(Array.isArray(pacificList!.lines) ? pacificList!.lines : []),
            { variant: smokeVariantId, unitPrice: 888, currency: 'USD' },
          ],
        },
      })
      expect(patchList.ok()).toBeTruthy()

      smokeMediaId = await createSmokeMedia(request, smokeAlt)

      await sweepSmokeTestArtifacts(request)

      const decoyVariantAfter = await request.get(
        `/api/product-variants?where[sku][equals]=${encodeURIComponent(DECOY_VARIANT_SKU)}&limit=1&depth=0`,
        { headers },
      )
      expect(decoyVariantAfter.ok()).toBeTruthy()
      expect(((await decoyVariantAfter.json()) as { docs: unknown[] }).docs).toHaveLength(1)

      const decoyProductAfter = await request.get(
        `/api/products?where[slug][equals]=${encodeURIComponent(DECOY_PRODUCT_SLUG)}&limit=1&depth=0`,
        { headers },
      )
      expect(decoyProductAfter.ok()).toBeTruthy()
      expect(((await decoyProductAfter.json()) as { docs: unknown[] }).docs).toHaveLength(1)

      const smokeVariantAfter = await request.get(
        `/api/product-variants?where[sku][equals]=${encodeURIComponent(smokeSku)}&limit=1&depth=0`,
        { headers },
      )
      expect(smokeVariantAfter.ok()).toBeTruthy()
      expect(((await smokeVariantAfter.json()) as { docs: unknown[] }).docs).toHaveLength(0)

      const smokeProductAfter = await request.get(
        `/api/products?where[slug][equals]=${encodeURIComponent(smokeSlug)}&limit=1&depth=0`,
        { headers },
      )
      expect(smokeProductAfter.ok()).toBeTruthy()
      expect(((await smokeProductAfter.json()) as { docs: unknown[] }).docs).toHaveLength(0)

      const smokeMediaAfter = await request.get(
        `/api/media?where[alt][equals]=${encodeURIComponent(smokeAlt)}&limit=1&depth=0`,
        { headers },
      )
      expect(smokeMediaAfter.ok()).toBeTruthy()
      expect(((await smokeMediaAfter.json()) as { docs: unknown[] }).docs).toHaveLength(0)

      const listAfter = await request.get(`/api/price-lists/${pacificListId}?depth=1`, { headers })
      expect(listAfter.ok()).toBeTruthy()
      const listDoc = (await listAfter.json()) as {
        lines?: Array<{ variant?: number | { id: number } }>
      }
      const stillLinked = (listDoc.lines ?? []).some((line) => {
        const v = line.variant
        const id = typeof v === 'object' && v !== null ? v.id : v
        return id === smokeVariantId
      })
      expect(stillLinked).toBe(false)
    } finally {
      if (pacificListId && smokeVariantId) {
        const listRes = await request.get(`/api/price-lists/${pacificListId}?depth=1`, { headers })
        if (listRes.ok()) {
          const listDoc = (await listRes.json()) as {
            lines?: Array<{ variant?: number | { id: number } }>
          }
          const remaining = (listDoc.lines ?? []).filter((line) => {
            const v = line.variant
            const id = typeof v === 'object' && v !== null ? v.id : v
            return id !== smokeVariantId
          })
          await request.patch(`/api/price-lists/${pacificListId}`, {
            headers,
            data: { lines: remaining },
          })
        }
      }
      if (smokeVariantId) {
        await request.delete(`/api/product-variants/${smokeVariantId}`, { headers }).catch(() => undefined)
      }
      if (smokeProductId) {
        await request.delete(`/api/products/${smokeProductId}`, { headers }).catch(() => undefined)
      }
      if (smokeMediaId) {
        await request.delete(`/api/media/${smokeMediaId}`, { headers }).catch(() => undefined)
      }
      await sweepSmokeTestArtifacts(request).catch(() => undefined)
    }
  })
})
