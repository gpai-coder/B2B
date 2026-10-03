import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import path from 'path'

import {
  fetchSeedQuote,
  patchQuote,
  restoreQuote,
  sweepSmokeTestArtifacts,
  type QuoteRestoreState,
} from '../helpers/admin-api'
import { loginVendor } from '../helpers/vendor-login'

const SEED_HERO_SLUG =
  'townsend-r-single-hole-single-handle-bathroom-faucet-1-2-gpm-4-5-l-min-with-lever-handle'
const SEED_HERO_SKU = '7353101.002'
const SEED_HERO_SKU_NICKEL = '7353101.013'
const SEED_QUOTE_NUMBER = 'Q-2026-0001'

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'

const PACIFIC_CONTRACT_LIST = 'Pacific Plumbing Contract 2026'

type SmokeCleanup = {
  adminCookieHeader: string
  productId?: number
  mediaId?: number
  variantId?: number
  orderId?: number
  pacificListId?: number
}

async function assertNoApplicationError(page: Page) {
  const appError = page.getByText('Application error', { exact: false })
  if (await appError.isVisible().catch(() => false)) {
    throw new Error('Hit Next.js application error page during smoke test')
  }
}

function isClosedRequestError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /Target page, context or browser has been closed|Request context disposed/i.test(msg)
}

async function runSmokeShutdown(
  request: APIRequestContext,
  cleanup: SmokeCleanup,
  quoteRestoreHolder: { restore: QuoteRestoreState | null },
  options: { ignoreClosedRequest?: boolean } = {},
) {
  const errors: unknown[] = []
  try {
    await restoreQuote(request, quoteRestoreHolder)
  } catch (err) {
    errors.push(err)
  }
  try {
    await runSmokeTeardown(request, cleanup)
  } catch (err) {
    errors.push(err)
  }
  const fatal = options.ignoreClosedRequest ? errors.filter((e) => !isClosedRequestError(e)) : errors
  if (fatal.length === 0) return
  const message = fatal.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')
  throw new Error(`Smoke shutdown failed: ${message}`)
}

async function runSmokeTeardown(request: APIRequestContext, state: SmokeCleanup) {
  if (!state.adminCookieHeader) return
  const headers = { Cookie: state.adminCookieHeader, 'Content-Type': 'application/json' }

  const assertOk = async (
    res: { ok: () => boolean; status: () => number; text: () => Promise<string> },
    label: string,
    allowNotFound = false,
  ) => {
    if (res.ok()) return
    if (allowNotFound && res.status() === 404) return
    const body = await res.text()
    throw new Error(`Smoke teardown failed (${label}): ${res.status()} ${body}`)
  }

  if (state.pacificListId && state.variantId) {
    const listRes = await request.get(`/api/price-lists/${state.pacificListId}`, { headers })
    if (listRes.ok()) {
      const listDoc = (await listRes.json()) as {
        lines?: Array<{ variant?: number | { id: number }; unitPrice?: number; currency?: string }>
      }
      const remainingLines = (listDoc.lines ?? []).filter((line) => {
        const v = line.variant
        const id = typeof v === 'object' && v !== null ? v.id : v
        return id !== state.variantId
      })
      const patchList = await request.patch(`/api/price-lists/${state.pacificListId}`, {
        headers,
        data: { lines: remainingLines },
      })
      await assertOk(patchList, 'remove smoke variant from Pacific price list')
    }
  }

  if (state.orderId && !Number.isNaN(state.orderId)) {
    await assertOk(
      await request.delete(`/api/orders/${state.orderId}`, { headers }),
      'delete order',
      true,
    )
    state.orderId = undefined
  }
  if (state.variantId) {
    await assertOk(
      await request.delete(`/api/product-variants/${state.variantId}`, { headers }),
      'delete variant',
      true,
    )
    state.variantId = undefined
  }
  if (state.productId) {
    await assertOk(
      await request.delete(`/api/products/${state.productId}`, { headers }),
      'delete product',
      true,
    )
    state.productId = undefined
  }
  if (state.mediaId) {
    await assertOk(
      await request.delete(`/api/media/${state.mediaId}`, { headers }),
      'delete media',
      true,
    )
    state.mediaId = undefined
  }
}

test.describe('B2B foundations smoke', () => {
  const cleanup: SmokeCleanup = { adminCookieHeader: '' }
  const quoteRestoreHolder: { restore: QuoteRestoreState | null } = { restore: null }

  test.beforeAll(async ({ request }) => {
    await sweepSmokeTestArtifacts(request)
  })

  test.afterAll(async ({ request }) => {
    await runSmokeShutdown(request, cleanup, quoteRestoreHolder)
  })

  test('admin creates catalog item with PDF; vendor sees company price; quote order flow', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)

    const runId = `smoke-${Date.now()}`
    const slug = `${runId}-faucet`
    const sku = `${runId}-sku`
    const productName = `${runId} Pro Faucet`

    try {
      await page.goto('/admin/login')
      await page.getByLabel(/^email/i).fill(adminEmail)
      await page.getByLabel(/^password/i).fill(adminPassword)
      await page.getByRole('button', { name: /^login$/i }).click()
      await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'))

      const cookies = await page.context().cookies()
      cleanup.adminCookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

      await page.goto('/admin/collections/products/create')
      await page.getByRole('textbox', { name: 'Name *' }).fill(productName)
      await page.getByRole('textbox', { name: 'Slug *' }).fill(slug)
      await page.getByRole('textbox', { name: 'Product Collection *' }).fill('Faucets')
      await page.getByRole('button', { name: 'Save' }).click()
      await page.waitForURL('**/admin/collections/products/**')

      const productRes = await request.get(
        `/api/products?where[slug][equals]=${encodeURIComponent(slug)}&limit=1`,
        { headers: { Cookie: cleanup.adminCookieHeader } },
      )
      const productBody = (await productRes.json()) as { docs: Array<{ id: number }> }
      cleanup.productId = productBody.docs[0]?.id
      expect(cleanup.productId).toBeTruthy()

      const pdfPath = path.resolve('scripts/fixtures/sample-spec.pdf')
      await page.goto('/admin/collections/media/create')
      await page.getByRole('textbox', { name: /alt/i }).fill(`Spec ${sku}`)
      await page.locator('input[type="file"]').first().setInputFiles(pdfPath)
      await page.getByRole('button', { name: 'Save' }).click()
      await page.waitForURL(/\/admin\/collections\/media\/\d+$/, { timeout: 120_000 })
      cleanup.mediaId = Number(page.url().split('/').pop())
      expect(cleanup.mediaId).toBeGreaterThan(0)

      const variantRes = await request.post('/api/product-variants', {
        headers: { Cookie: cleanup.adminCookieHeader, 'Content-Type': 'application/json' },
        data: {
          sku,
          name: `${productName} Chrome`,
          product: cleanup.productId,
          finish: 'Chrome',
          specPdf: cleanup.mediaId,
        },
      })
      expect(variantRes.ok()).toBeTruthy()
      const createdVariant = (await variantRes.json()) as { doc: { id: number } }
      cleanup.variantId = createdVariant.doc.id
      const patchVariant = await request.patch(`/api/product-variants/${cleanup.variantId}`, {
        headers: { Cookie: cleanup.adminCookieHeader, 'Content-Type': 'application/json' },
        data: { specPdf: cleanup.mediaId },
      })
      expect(patchVariant.ok()).toBeTruthy()

      const pacificLists = await request.get('/api/price-lists?where[kind][equals]=company&limit=5', {
        headers: { Cookie: cleanup.adminCookieHeader },
      })
      expect(pacificLists.ok()).toBeTruthy()
      const listBody = (await pacificLists.json()) as {
        docs: Array<{ id: number; name?: string; lines?: Array<{ variant?: number | { id: number } }> }>
      }
      const pacificList = listBody.docs.find((d) => d.name === PACIFIC_CONTRACT_LIST)
      expect(pacificList).toBeTruthy()
      cleanup.pacificListId = pacificList!.id

      const variantLookup = await request.get(
        `/api/product-variants?where[sku][equals]=${encodeURIComponent(sku)}&limit=1`,
        { headers: { Cookie: cleanup.adminCookieHeader } },
      )
      const variantBody = (await variantLookup.json()) as { docs: Array<{ id: number }> }
      cleanup.variantId = variantBody.docs[0]?.id ?? cleanup.variantId
      expect(cleanup.variantId).toBeTruthy()

      const patchRes = await request.patch(`/api/price-lists/${pacificList!.id}`, {
        headers: { Cookie: cleanup.adminCookieHeader, 'Content-Type': 'application/json' },
        data: {
          lines: [
            ...(Array.isArray(pacificList!.lines) ? pacificList!.lines : []),
            { variant: cleanup.variantId, unitPrice: 777, currency: 'USD' },
          ],
        },
      })
      expect(patchRes.ok()).toBeTruthy()

      await loginVendor(page, `/products/${slug}`)
      await assertNoApplicationError(page)
      await expect(page).toHaveURL(new RegExp(`/products/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

      await expect(page.getByTestId('product-page')).toBeVisible()
      await expect(page.getByTestId(`product-price-${sku}`)).toContainText('777')
      await expect(page.getByTestId(`product-price-${sku}`)).toContainText('company')

      const heroResponse = await page.goto(`/products/${SEED_HERO_SLUG}`)
      expect(heroResponse?.ok()).toBeTruthy()
      await assertNoApplicationError(page)
      await expect(page.getByTestId('product-page')).toBeVisible()
      await expect(page.getByTestId('product-active-sku')).toContainText(SEED_HERO_SKU)
      await expect(page.getByTestId(`product-price-${SEED_HERO_SKU}`)).toContainText('199')
      await expect(page.getByTestId(`product-price-${SEED_HERO_SKU}`)).toContainText('189')
      await expect(page.getByTestId(`product-price-${SEED_HERO_SKU}`)).toContainText('179')
      const heroImg = page.getByTestId('product-primary-image').locator('img')
      await expect(heroImg).toBeVisible()
      await expect
        .poll(async () => heroImg.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0)

      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(`/products/${SEED_HERO_SLUG}`)
      await assertNoApplicationError(page)
      await expect(page.getByTestId('product-primary-image')).toBeVisible()
      await expect(page.getByTestId('product-buybox')).toBeVisible()
      const galleryLayout = await page.evaluate(() => {
        const main = document.querySelector('[data-testid="product-primary-image"]')
        const buybox = document.querySelector('[data-testid="product-buybox"]')
        if (!main || !buybox) return null
        const imgRect = main.getBoundingClientRect()
        const buyRect = buybox.getBoundingClientRect()
        return { imageRight: imgRect.right, buyBoxLeft: buyRect.left }
      })
      expect(galleryLayout).not.toBeNull()
      expect(galleryLayout!.imageRight).toBeLessThanOrEqual(galleryLayout!.buyBoxLeft + 1)

      const specDownload = page.waitForEvent('download')
      await page.getByTestId(`product-doc-${SEED_HERO_SKU}-spec`).click()
      const specFile = await specDownload
      expect(specFile.suggestedFilename()).toMatch(/\.pdf$/i)

      await page.goto('/catalog')
      await assertNoApplicationError(page)
      await expect(page.getByTestId('catalog-page')).toBeVisible()
      await page.getByTestId('filter-finish-Matte-Black').click()
      await page.waitForURL(/finish=Matte/i)
      await expect(page.getByTestId('filter-finish-Matte-Black')).toBeChecked()

      await page.goto(`/products/${SEED_HERO_SLUG}`)
      await page.getByTestId('pdp-finish-Polished-Nickel').click()
      await expect(page.getByTestId('product-active-sku')).toContainText(SEED_HERO_SKU_NICKEL)
      await expect(page.getByTestId(`product-price-${SEED_HERO_SKU_NICKEL}`)).toBeVisible()

      const mediaRes = await request.get('/api/vendor/media/1')
      expect(mediaRes.status()).toBeGreaterThanOrEqual(401)

      const { headers: adminHeaders, doc: seedQuote } = await fetchSeedQuote(request, SEED_QUOTE_NUMBER)
      const converted =
        seedQuote.convertedOrder == null
          ? null
          : typeof seedQuote.convertedOrder === 'object'
            ? seedQuote.convertedOrder.id
            : seedQuote.convertedOrder
      quoteRestoreHolder.restore = {
        quoteId: seedQuote.id,
        snapshot: {
          status: seedQuote.status,
          expiresAt: seedQuote.expiresAt,
          convertedOrder: converted ?? null,
        },
      }

      const acceptRes = await patchQuote(
        request,
        seedQuote.id,
        {
          status: 'accepted',
          convertedOrder: null,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
        },
        adminHeaders,
      )
      expect(acceptRes.ok()).toBeTruthy()

      await page.goto(`/quotes/${SEED_QUOTE_NUMBER}/order`)
      await assertNoApplicationError(page)
      await expect(page.getByTestId('quote-order-page')).toBeVisible()
      await page.getByTestId('submit-quote-order').click()
      await page.waitForURL('**/orders/**', { timeout: 30_000 })
      await assertNoApplicationError(page)
      cleanup.orderId = Number(page.url().split('/orders/')[1]?.split('?')[0])
      await expect(page.getByTestId('order-submitted-banner')).toBeVisible()
    } finally {
      await runSmokeShutdown(request, cleanup, quoteRestoreHolder, { ignoreClosedRequest: true })
    }
  })
})
