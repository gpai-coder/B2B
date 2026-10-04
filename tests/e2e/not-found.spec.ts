import { test, expect } from '@playwright/test'

import { loginVendor } from '../helpers/vendor-login'

const BRANDED_HEADING = /page not found/i

test.describe('branded not found pages', () => {
  test('unknown top-level path returns 404 with branded content', async ({ page }) => {
    const path = `/no-such-page-${Date.now()}`
    const response = await page.goto(path)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: BRANDED_HEADING })).toBeVisible()
    await expect(page.getByRole('link', { name: /return to catalog/i })).toBeVisible()
  })

  test('unknown product slug returns 404 with branded content', async ({ page }) => {
    const slug = `not-a-real-product-${Date.now()}`
    await loginVendor(page, '/catalog')
    const response = await page.goto(`/products/${slug}`)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: BRANDED_HEADING })).toBeVisible()
  })
})
