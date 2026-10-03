import { test, expect } from '@playwright/test'

import { expectVendorOnPath, loginVendor } from '../helpers/vendor-login'

test.describe('Catalog search', () => {
  test('typeahead navigates to PDP and search results page works', async ({ page }) => {
    await loginVendor(page, '/catalog')
    await page.waitForURL('**/catalog**')

    const search = page.getByTestId('catalog-search-input')
    await search.fill('7353101')
    await expect(page.getByTestId('catalog-search-suggest')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('catalog-search-suggest').getByRole('link').first().click()
    await page.waitForURL('**/products/**')
    await expect(page.getByTestId('product-page')).toBeVisible()

    await search.fill('townsend')
    await search.press('Enter')
    await page.waitForURL('**/search?q=townsend**')
    await expect(page.getByTestId('search-page')).toBeVisible()
    await expect(page.getByTestId('search-empty')).toHaveCount(0)
  })

  test('Delancey PDP hides order CTAs when all variants are discontinued', async ({ page }) => {
    const delanceyPath =
      '/products/delancey-r-single-handle-pull-down-dual-spray-function-kitchen-faucet-1-5-gpm-5-7-l-min'
    await loginVendor(page, delanceyPath)
    await expectVendorOnPath(page, delanceyPath)
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('product-order-cta')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add to order' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Add to quote' })).toHaveCount(0)
  })
})
