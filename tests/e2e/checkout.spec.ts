import { test, expect } from '@playwright/test'

import { deleteOrderById } from '../helpers/admin-api'
import { loginVendor } from '../helpers/vendor-login'

const HERO_SLUG =
  'townsend-r-single-hole-single-handle-bathroom-faucet-1-2-gpm-4-5-l-min-with-lever-handle'
const HERO_SKU = '7353101.002'

test.describe('Cart checkout', () => {
  test('vendor checks out cart and order appears in history', async ({ page, request }) => {
    test.setTimeout(120_000)
    const po = `E2E-PO-${Date.now()}`
    let orderIdForCleanup: string | undefined

    try {
      const path = `/products/${HERO_SLUG}`
      await loginVendor(page, path)
      await page.getByTestId(`cart-qty-${HERO_SKU}`).fill('1')
      await page.getByTestId(`cart-add-${HERO_SKU}`).click()
      await expect(page.getByTestId(`cart-add-${HERO_SKU}`)).toBeEnabled({ timeout: 15_000 })
      await page.goto('/cart')
      await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('cart-checkout').click()

      await expect(page.getByTestId('checkout-page')).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('checkout-po').fill(po)
      await page.getByTestId('checkout-submit').click()
      await page.waitForURL(/\/orders\/\d+\?submitted=1/, { timeout: 30_000 })
      orderIdForCleanup = page.url().match(/\/orders\/(\d+)/)?.[1]

      await page.goto('/orders')
      await expect(page.getByTestId('orders-page')).toBeVisible()
      if (orderIdForCleanup) {
        await expect(page.getByTestId(`order-row-${orderIdForCleanup}`)).toBeVisible()
      }
    } finally {
      if (orderIdForCleanup) {
        await deleteOrderById(request, orderIdForCleanup).catch(() => undefined)
      }
    }
  })
})
