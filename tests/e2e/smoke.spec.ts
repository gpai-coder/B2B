import { test, expect } from '@playwright/test'
import path from 'path'

const SEED_HERO_SLUG =
  'townsend-r-single-hole-single-handle-bathroom-faucet-1-2-gpm-4-5-l-min-with-lever-handle'
const SEED_HERO_SKU = '7353101.002'
const SEED_HERO_SKU_NICKEL = '7353101.013'

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'
const vendorEmail = process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local'
const vendorPassword = process.env.SEED_VENDOR_A_PASSWORD ?? 'local-dev-vendor-a-password'

const PACIFIC_CONTRACT_LIST = 'Pacific Plumbing Contract 2026'

test.describe('B2B foundations smoke', () => {
  test('admin creates catalog item with PDF; vendor sees company price; quote order flow', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)

    const runId = `smoke-${Date.now()}`
    const slug = `${runId}-faucet`
    const sku = `${runId}-sku`
    const productName = `${runId} Pro Faucet`

    let productId: number | undefined
    let mediaId: number | undefined
    let variantId: number | undefined
    let orderId: number | undefined
    let pacificListId: number | undefined
    let adminCookieHeader = ''

    try {
      await page.goto('/admin/login')
      await page.getByLabel(/^email/i).fill(adminEmail)
      await page.getByLabel(/^password/i).fill(adminPassword)
      await page.getByRole('button', { name: /^login$/i }).click()
      await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'))

      const cookies = await page.context().cookies()
      adminCookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

      await page.goto('/admin/collections/products/create')
      await page.getByRole('textbox', { name: 'Name *' }).fill(productName)
      await page.getByRole('textbox', { name: 'Slug *' }).fill(slug)
      await page.getByRole('textbox', { name: 'Product Collection *' }).fill('Faucets')
      await page.getByRole('button', { name: 'Save' }).click()
      await page.waitForURL('**/admin/collections/products/**')

      const productRes = await request.get(
        `/api/products?where[slug][equals]=${encodeURIComponent(slug)}&limit=1`,
        { headers: { Cookie: adminCookieHeader } },
      )
      const productBody = (await productRes.json()) as { docs: Array<{ id: number }> }
      productId = productBody.docs[0]?.id
      expect(productId).toBeTruthy()

      const pdfPath = path.resolve('scripts/fixtures/sample-spec.pdf')
      await page.goto('/admin/collections/media/create')
      await page.getByRole('textbox', { name: /alt/i }).fill(`Spec ${sku}`)
      await page.locator('input[type="file"]').first().setInputFiles(pdfPath)
      await page.getByRole('button', { name: 'Save' }).click()
      await page.waitForURL(/\/admin\/collections\/media\/\d+$/, { timeout: 120_000 })
      mediaId = Number(page.url().split('/').pop())
      expect(mediaId).toBeGreaterThan(0)

      const variantRes = await request.post('/api/product-variants', {
        headers: { Cookie: adminCookieHeader, 'Content-Type': 'application/json' },
        data: {
          sku,
          name: `${productName} Chrome`,
          product: productId,
          finish: 'Chrome',
          specPdf: mediaId,
        },
      })
      expect(variantRes.ok()).toBeTruthy()
      const createdVariant = (await variantRes.json()) as { doc: { id: number } }
      variantId = createdVariant.doc.id
      const patchVariant = await request.patch(`/api/product-variants/${variantId}`, {
        headers: { Cookie: adminCookieHeader, 'Content-Type': 'application/json' },
        data: { specPdf: mediaId },
      })
      expect(patchVariant.ok()).toBeTruthy()

      const pacificLists = await request.get('/api/price-lists?where[kind][equals]=company&limit=5', {
        headers: { Cookie: adminCookieHeader },
      })
      expect(pacificLists.ok()).toBeTruthy()
      const listBody = (await pacificLists.json()) as {
        docs: Array<{ id: number; name?: string; lines?: Array<{ variant?: number | { id: number } }> }>
      }
      const pacificList = listBody.docs.find((d) => d.name === PACIFIC_CONTRACT_LIST)
      expect(pacificList).toBeTruthy()
      pacificListId = pacificList!.id

      const variantLookup = await request.get(
        `/api/product-variants?where[sku][equals]=${encodeURIComponent(sku)}&limit=1`,
        { headers: { Cookie: adminCookieHeader } },
      )
      const variantBody = (await variantLookup.json()) as { docs: Array<{ id: number }> }
      variantId = variantBody.docs[0]?.id ?? variantId
      expect(variantId).toBeTruthy()

      const patchRes = await request.patch(`/api/price-lists/${pacificList!.id}`, {
        headers: { Cookie: adminCookieHeader, 'Content-Type': 'application/json' },
        data: {
          lines: [
            ...(Array.isArray(pacificList!.lines) ? pacificList!.lines : []),
            { variant: variantId, unitPrice: 777, currency: 'USD' },
          ],
        },
      })
      expect(patchRes.ok()).toBeTruthy()

      await page.goto(`/login?next=${encodeURIComponent(`/products/${slug}`)}`)
      await page.fill('input[name="email"]', vendorEmail)
      await page.fill('input[name="password"]', vendorPassword)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL(`**/products/${slug}**`, { timeout: 30_000 })

      await expect(page.getByTestId('product-page')).toBeVisible()
      await expect(page.getByTestId(`product-price-${sku}`)).toContainText('777')
      await expect(page.getByTestId(`product-price-${sku}`)).toContainText('company')

      const heroResponse = await page.goto(`/products/${SEED_HERO_SLUG}`)
      expect(heroResponse?.ok()).toBeTruthy()
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
      const specDownload = page.waitForEvent('download')
      await page.getByTestId(`product-doc-${SEED_HERO_SKU}-spec`).click()
      const specFile = await specDownload
      expect(specFile.suggestedFilename()).toMatch(/\.pdf$/i)

      await page.goto('/catalog')
      await expect(page.getByTestId('catalog-page')).toBeVisible()
      await page.getByTestId('filter-finish-Matte-Black').check()
      await expect(page.getByTestId('catalog-result-count')).toBeVisible()

      await page.goto(`/products/${SEED_HERO_SLUG}`)
      await page.getByTestId('pdp-finish-Polished-Nickel').click()
      await expect(page.getByTestId('product-active-sku')).toContainText(SEED_HERO_SKU_NICKEL)
      await expect(page.getByTestId(`product-price-${SEED_HERO_SKU_NICKEL}`)).toBeVisible()

      const mediaRes = await request.get('/api/vendor/media/1')
      expect(mediaRes.status()).toBeGreaterThanOrEqual(401)

      await page.goto('/quotes/Q-2026-0001/order')
      await page.getByTestId('submit-quote-order').click()
      await page.waitForURL('**/orders/**')
      orderId = Number(page.url().split('/orders/')[1]?.split('?')[0])
      await expect(page.getByTestId('order-submitted-banner')).toBeVisible()
    } finally {
      if (!adminCookieHeader) return
      const headers = { Cookie: adminCookieHeader, 'Content-Type': 'application/json' }

      const assertOk = async (res: { ok: () => boolean; status: () => number; text: () => Promise<string> }, label: string) => {
        if (!res.ok()) {
          const body = await res.text()
          throw new Error(`Smoke teardown failed (${label}): ${res.status()} ${body}`)
        }
      }

      if (pacificListId && variantId) {
        const listRes = await request.get(`/api/price-lists/${pacificListId}`, { headers })
        expect(listRes.ok()).toBeTruthy()
        const listDoc = (await listRes.json()) as {
          lines?: Array<{ variant?: number | { id: number }; unitPrice?: number; currency?: string }>
        }
        const remainingLines = (listDoc.lines ?? []).filter((line) => {
          const v = line.variant
          const id = typeof v === 'object' && v !== null ? v.id : v
          return id !== variantId
        })
        const patchList = await request.patch(`/api/price-lists/${pacificListId}`, {
          headers,
          data: { lines: remainingLines },
        })
        await assertOk(patchList, 'remove smoke variant from Pacific price list')
      }

      if (orderId && !Number.isNaN(orderId)) {
        await assertOk(await request.delete(`/api/orders/${orderId}`, { headers }), 'delete order')
      }
      if (variantId) {
        await assertOk(
          await request.delete(`/api/product-variants/${variantId}`, { headers }),
          'delete variant',
        )
      }
      if (productId) {
        await assertOk(await request.delete(`/api/products/${productId}`, { headers }), 'delete product')
      }
      if (mediaId) {
        await assertOk(await request.delete(`/api/media/${mediaId}`, { headers }), 'delete media')
      }
    }
  })
})
