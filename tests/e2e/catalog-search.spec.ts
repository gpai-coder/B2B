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

  test('Delancey PDP hides order CTAs when all variants are discontinued', async ({ page }) => {
    const delanceyPath =
      '/products/delancey-r-single-handle-pull-down-dual-spray-function-kitchen-faucet-1-5-gpm-5-7-l-min'
    await page.goto(`/login?next=${encodeURIComponent(delanceyPath)}`)
    await page.fill('input[name="email"]', vendorEmail)
    await page.fill('input[name="password"]', vendorPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(`**${delanceyPath}**`, { timeout: 30_000 })
    await expect(page.getByTestId('product-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('product-order-cta')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add to order' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Add to quote' })).toHaveCount(0)
  })
})
