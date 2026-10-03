import { test, expect } from '@playwright/test'

import { expectVendorOnPath, loginVendor } from '../helpers/vendor-login'

const HERO_SKU = '7353101.002'

test.describe('Quick order', () => {
  test('validate and add lines with idempotent replay', async ({ page }) => {
    await loginVendor(page, '/quick-order')
    await expectVendorOnPath(page, '/quick-order')

    await page.getByTestId('quick-order-input').fill(`${HERO_SKU} 2`)
    await page.getByRole('button', { name: 'Validate' }).click()
    await expect(page.getByTestId('quick-order-preview')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`quick-order-line-${HERO_SKU}`)).toContainText('OK')

    await page.getByTestId('quick-order-apply').click()
    await expect(page.getByTestId('quick-order-apply-message')).toContainText(/Added/i)

    await page.getByTestId('quick-order-apply').click()
    await expect(page.getByTestId('quick-order-apply-message')).toContainText(/idempotent/i)

    await page.goto('/cart')
    await expect(page.getByTestId(`cart-line-${HERO_SKU}`)).toBeVisible()
    await page.getByTestId(`cart-remove-${HERO_SKU}`).click()
    await expect(page.getByTestId('cart-empty')).toBeVisible({ timeout: 15_000 })
  })
})
