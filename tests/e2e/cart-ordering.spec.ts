import { test, expect } from '@playwright/test'

const vendorEmail = process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local'
const vendorPassword = process.env.SEED_VENDOR_A_PASSWORD ?? 'local-dev-vendor-a-password'

const HERO_SLUG =
  'townsend-r-single-hole-single-handle-bathroom-faucet-1-2-gpm-4-5-l-min-with-lever-handle'
const HERO_SKU = '7353101.002'

const CHAMPION_SLUG =
  'champion-r-4-one-piece-1-6-gpf-6-0-lpf-chair-height-elongated-toilet-with-seat'
const CHAMPION_SKU = '2034314.020'

async function loginVendor(page: import('@playwright/test').Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[name="email"]', vendorEmail)
  await page.fill('input[name="password"]', vendorPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('Cart (PR A)', () => {
  test('add to cart from PDP shows priced line and subtotal', async ({ page }) => {
    const path = `/products/${HERO_SLUG}`
    await loginVendor(page, path)
    await page.waitForURL(`**${path}**`, { timeout: 30_000 })
    await expect(page.getByTestId('product-page')).toBeVisible()

    await page.getByTestId(`cart-qty-${HERO_SKU}`).fill('2')
    await page.getByTestId(`cart-add-${HERO_SKU}`).click()
    await expect(page.getByTestId(`cart-add-${HERO_SKU}`)).toBeEnabled()

    await page.goto('/cart')
    await expect(page.getByTestId('cart-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`cart-line-${HERO_SKU}`)).toBeVisible()
    await expect(page.getByTestId('cart-subtotal')).toContainText('398')

    await page.getByTestId(`cart-remove-${HERO_SKU}`).click()
    await expect(page.getByTestId('cart-empty')).toBeVisible({ timeout: 15_000 })
  })

  test('MOQ validation blocks invalid quantity on PDP', async ({ page }) => {
    const path = `/products/${CHAMPION_SLUG}?sku=${encodeURIComponent(CHAMPION_SKU)}`
    await loginVendor(page, path)
    await page.waitForURL(`**${CHAMPION_SLUG}**`, { timeout: 30_000 })

    await page.getByTestId(`cart-qty-${CHAMPION_SKU}`).fill('5')
    await page.getByTestId(`cart-add-${CHAMPION_SKU}`).click()
    await expect(page.getByTestId(`cart-error-${CHAMPION_SKU}`)).toBeVisible()
    await expect(page.getByTestId(`cart-error-${CHAMPION_SKU}`)).toContainText(/6/)
  })
})
