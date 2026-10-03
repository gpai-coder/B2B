import { test, expect } from '@playwright/test'

import { loginVendor } from '../helpers/vendor-login'

const HERO_SLUG =
  'townsend-r-single-hole-single-handle-bathroom-faucet-1-2-gpm-4-5-l-min-with-lever-handle'
const HERO_SKU = '7353101.002'

test.describe('Cart checkout', () => {
  test('vendor checks out cart and order appears in history', async ({ page, request }) => {
    test.setTimeout(120_000)
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'
    const po = `E2E-PO-${Date.now()}`

    const path = `/products/${HERO_SLUG}`
    await loginVendor(page, path)
    await page.getByTestId(`cart-qty-${HERO_SKU}`).fill('1')
    await page.getByTestId(`cart-add-${HERO_SKU}`).click()
    await page.goto('/cart')
    await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('cart-checkout').click()

    await expect(page.getByTestId('checkout-page')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('checkout-po').fill(po)
    await page.getByTestId('checkout-submit').click()
    await page.waitForURL(/\/orders\/\d+\?submitted=1/, { timeout: 30_000 })
    const orderIdForCleanup = page.url().match(/\/orders\/(\d+)/)?.[1]

    await page.goto('/orders')
    await expect(page.getByTestId('orders-page')).toBeVisible()
    if (orderIdForCleanup) {
      await expect(page.getByTestId(`order-row-${orderIdForCleanup}`)).toBeVisible()
    }

    try {
      if (!orderIdForCleanup) return
      await page.goto('/admin/login')
      await page.getByLabel(/^email/i).fill(adminEmail)
      await page.getByLabel(/^password/i).fill(adminPassword)
      await page.getByRole('button', { name: /^login$/i }).click()
      await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'))
      const cookies = await page.context().cookies()
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      await request.delete(`/api/orders/${orderIdForCleanup}`, { headers: { Cookie: cookieHeader } })
    } catch {
      // best-effort
    }
  })
})
