import { test, expect } from '@playwright/test'

const vendorEmail = process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local'
const vendorPassword = process.env.SEED_VENDOR_A_PASSWORD ?? 'local-dev-vendor-a-password'

test.describe('Catalog search', () => {
  test('typeahead navigates to PDP and search results page works', async ({ page }) => {
    await page.goto('/login?next=/catalog')
    await page.fill('input[name="email"]', vendorEmail)
    await page.fill('input[name="password"]', vendorPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()
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
})
