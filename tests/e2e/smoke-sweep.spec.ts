import { test, expect, type APIRequestContext } from '@playwright/test'

import { adminJwtHeaders, createSmokeMedia, sweepSmokeTestArtifacts } from '../helpers/admin-api'
import { isLocalBaseUrl } from '../helpers/e2e-env'

const PACIFIC_CONTRACT_LIST = 'Pacific Plumbing Contract 2026'
const SMOKE_RUN_MS = '1735923456789'

const isLocal = isLocalBaseUrl()

type SweepTestCleanupState = {
  decoyProductId?: number
  decoyVariantId?: number
  smokeProductId?: number
  smokeVariantId?: number
  smokeMediaId?: number
  pacificListId?: number
}

function variantIdFromLine(variant: unknown): number | undefined {
  if (variant == null) return undefined
  if (typeof variant === 'object') return (variant as { id: number }).id
  return Number(variant)
}

function isClosedRequestError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /Target page, context or browser has been closed|Request context disposed/i.test(msg)
}

async function runSweepTestCleanup(request: APIRequestContext, state: SweepTestCleanupState) {
  const headers = await adminJwtHeaders(request)

  const trackedVariantIds = new Set(
    [state.smokeVariantId, state.decoyVariantId].filter((id): id is number => id != null),
  )

  if (state.pacificListId && trackedVariantIds.size > 0) {
    const listRes = await request.get(`/api/price-lists/${state.pacificListId}?depth=0`, { headers })
    if (!listRes.ok()) {
      throw new Error(
        `Sweep test cleanup failed (GET price-list ${state.pacificListId}): ${listRes.status()} ${await listRes.text()}`,
      )
    }
    const listDoc = (await listRes.json()) as {
      lines?: Array<{ variant?: unknown; unitPrice?: number; currency?: string }>
    }
    const lines = listDoc.lines ?? []
    const remaining = lines.filter((line) => {
      const vid = variantIdFromLine(line.variant)
      return vid == null || !trackedVariantIds.has(vid)
    })
    if (remaining.length !== lines.length) {
      const patch = await request.patch(`/api/price-lists/${state.pacificListId}`, {
        headers,
        data: { lines: remaining },
      })
      if (!patch.ok()) {
        throw new Error(
          `Sweep test cleanup failed (PATCH price-list ${state.pacificListId}): ${patch.status()} ${await patch.text()}`,
        )
      }
    }
  }

  const deleteOk = async (label: string, res: { ok: () => boolean; status: () => number; text: () => Promise<string> }) => {
    if (res.ok() || res.status() === 404) return
    throw new Error(`Sweep test cleanup failed (${label}): ${res.status()} ${await res.text()}`)
  }

  if (state.smokeVariantId) {
    await deleteOk(
      `DELETE smoke variant ${state.smokeVariantId}`,
      await request.delete(`/api/product-variants/${state.smokeVariantId}`, { headers }),
    )
    state.smokeVariantId = undefined
  }
  if (state.decoyVariantId) {
    await deleteOk(
      `DELETE decoy variant ${state.decoyVariantId}`,
      await request.delete(`/api/product-variants/${state.decoyVariantId}`, { headers }),
    )
    state.decoyVariantId = undefined
  }
  if (state.smokeProductId) {
    await deleteOk(
      `DELETE smoke product ${state.smokeProductId}`,
      await request.delete(`/api/products/${state.smokeProductId}`, { headers }),
    )
    state.smokeProductId = undefined
  }
  if (state.decoyProductId) {
    await deleteOk(
      `DELETE decoy product ${state.decoyProductId}`,
      await request.delete(`/api/products/${state.decoyProductId}`, { headers }),
    )
    state.decoyProductId = undefined
  }
  if (state.smokeMediaId) {
    await deleteOk(
      `DELETE smoke media ${state.smokeMediaId}`,
      await request.delete(`/api/media/${state.smokeMediaId}`, { headers }),
    )
    state.smokeMediaId = undefined
  }
}

test.describe('smoke artifact sweep', () => {
  test.skip(!isLocal, 'local only: creates decoy catalog rows')

  const cleanupState: SweepTestCleanupState = {}

  test.afterAll(async ({ request }) => {
    await runSweepTestCleanup(request, cleanupState)
  })

  test('removes strict smoke markers but not decoy catalog rows', async ({ request }) => {
    const headers = await adminJwtHeaders(request)
    const runMs = Date.now()
    const decoyProductSlug = `frosted-smoke-glass-shower-panel-zz${runMs}`
    const decoyVariantSku = `AS-SMOKE-GLASS-ZZ${runMs}`
    const smokeSlug = `smoke-${SMOKE_RUN_MS}-faucet`
    const smokeSku = `smoke-${SMOKE_RUN_MS}-sku`
    const smokeAlt = `Spec ${smokeSku}`

    try {
      const decoyProductRes = await request.post('/api/products', {
        headers,
        data: {
          name: `Frosted Smoke Glass Panel ${runMs}`,
          slug: decoyProductSlug,
          productCollection: 'Showers',
        },
      })
      expect(decoyProductRes.ok(), await decoyProductRes.text()).toBeTruthy()
      cleanupState.decoyProductId = ((await decoyProductRes.json()) as { doc: { id: number } }).doc.id

      const decoyVariantRes = await request.post('/api/product-variants', {
        headers,
        data: {
          sku: decoyVariantSku,
          name: `AS Smoke Glass ${runMs}`,
          product: cleanupState.decoyProductId,
          finish: 'Clear',
        },
      })
      expect(decoyVariantRes.ok(), await decoyVariantRes.text()).toBeTruthy()
      cleanupState.decoyVariantId = ((await decoyVariantRes.json()) as { doc: { id: number } }).doc.id

      const smokeProductRes = await request.post('/api/products', {
        headers,
        data: {
          name: 'Sweep Test Faucet',
          slug: smokeSlug,
          productCollection: 'Faucets',
        },
      })
      expect(smokeProductRes.ok(), await smokeProductRes.text()).toBeTruthy()
      cleanupState.smokeProductId = ((await smokeProductRes.json()) as { doc: { id: number } }).doc.id

      const smokeVariantRes = await request.post('/api/product-variants', {
        headers,
        data: {
          sku: smokeSku,
          name: 'Sweep Test Chrome',
          product: cleanupState.smokeProductId,
          finish: 'Chrome',
        },
      })
      expect(smokeVariantRes.ok(), await smokeVariantRes.text()).toBeTruthy()
      cleanupState.smokeVariantId = ((await smokeVariantRes.json()) as { doc: { id: number } }).doc.id

      const listsRes = await request.get('/api/price-lists?where[kind][equals]=company&limit=20&depth=0', {
        headers,
      })
      expect(listsRes.ok()).toBeTruthy()
      const listsBody = (await listsRes.json()) as {
        docs: Array<{ id: number; name?: string; lines?: Array<{ variant?: number | { id: number } }> }>
      }
      const pacificList = listsBody.docs.find((d) => d.name === PACIFIC_CONTRACT_LIST)
      expect(pacificList).toBeTruthy()
      cleanupState.pacificListId = pacificList!.id

      const listDetailRes = await request.get(`/api/price-lists/${cleanupState.pacificListId}?depth=0`, {
        headers,
      })
      expect(listDetailRes.ok()).toBeTruthy()
      const listDetail = (await listDetailRes.json()) as {
        lines?: Array<{ variant?: number | { id: number } }>
      }

      const patchList = await request.patch(`/api/price-lists/${cleanupState.pacificListId}`, {
        headers,
        data: {
          lines: [
            ...(Array.isArray(listDetail.lines) ? listDetail.lines : []),
            { variant: cleanupState.smokeVariantId, unitPrice: 888, currency: 'USD' },
          ],
        },
      })
      expect(patchList.ok(), await patchList.text()).toBeTruthy()

      cleanupState.smokeMediaId = await createSmokeMedia(request, smokeAlt)

      await sweepSmokeTestArtifacts(request)

      const decoyVariantAfter = await request.get(
        `/api/product-variants?where[sku][equals]=${encodeURIComponent(decoyVariantSku)}&limit=1&depth=0`,
        { headers },
      )
      expect(decoyVariantAfter.ok()).toBeTruthy()
      expect(((await decoyVariantAfter.json()) as { docs: unknown[] }).docs).toHaveLength(1)

      const decoyProductAfter = await request.get(
        `/api/products?where[slug][equals]=${encodeURIComponent(decoyProductSlug)}&limit=1&depth=0`,
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

      const listAfter = await request.get(`/api/price-lists/${cleanupState.pacificListId}?depth=0`, {
        headers,
      })
      expect(listAfter.ok()).toBeTruthy()
      const listDoc = (await listAfter.json()) as {
        lines?: Array<{ variant?: number | { id: number } }>
      }
      const stillLinked = (listDoc.lines ?? []).some((line) => {
        const v = line.variant
        const id = typeof v === 'object' && v !== null ? v.id : v
        return id === cleanupState.smokeVariantId
      })
      expect(stillLinked).toBe(false)
    } finally {
      try {
        await runSweepTestCleanup(request, cleanupState)
        await sweepSmokeTestArtifacts(request)
      } catch (err) {
        if (!isClosedRequestError(err)) throw err
      }
    }
  })
})
