import { test, expect } from '@playwright/test'

import { deleteCartBulkAddsByKey } from '../helpers/admin-api'
import { expectVendorOnPath, loginVendor } from '../helpers/vendor-login'

const HERO_SKU = '7353101.002'

test.describe('Quick order', () => {
  test('validate and add lines with idempotent replay', async ({ page, request }) => {
    let idempotencyKey = ''

    try {
      await loginVendor(page, '/quick-order')
      await expectVendorOnPath(page, '/quick-order')

      await page.getByTestId('quick-order-input').fill(`${HERO_SKU} 2`)
      await page.getByRole('button', { name: 'Validate' }).click()
      await expect(page.getByTestId('quick-order-preview')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId(`quick-order-line-${HERO_SKU}`)).toContainText('OK')

      await page.getByTestId('quick-order-apply').click()
      await expect(page.getByTestId('quick-order-apply-message')).toContainText(/Added/i)
      idempotencyKey = await page.getByTestId('quick-order-idempotency-key').inputValue()

      await page.getByTestId('quick-order-input').fill(`${HERO_SKU} 1`)
      await page.getByRole('button', { name: 'Validate' }).click()
      await expect(page.getByTestId('quick-order-preview')).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('quick-order-apply').click()
      await expect(page.getByTestId('quick-order-apply-message')).toContainText(/^Added/i)
      await expect(page.getByTestId('quick-order-apply-message')).not.toContainText(/idempotent/i)

      await page.goto('/cart')
      await expect(page.getByTestId(`cart-line-${HERO_SKU}`)).toBeVisible()
      await page.getByTestId(`cart-remove-${HERO_SKU}`).click()
      await expect(page.getByTestId('cart-empty')).toBeVisible({ timeout: 15_000 })
    } finally {
      if (idempotencyKey) {
        await deleteCartBulkAddsByKey(request, idempotencyKey).catch(() => undefined)
      }
    }
  })
})
