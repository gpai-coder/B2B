import { test, expect } from '@playwright/test'

import { expectVendorOnPath, loginVendor } from '../helpers/vendor-login'

const HERO_SKU = '7353101.002'

test.describe('Quick order', () => {
  test('validate and add lines with idempotent replay', async ({ page, request }) => {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'

    await loginVendor(page, '/quick-order')
    await expectVendorOnPath(page, '/quick-order')

    await page.getByTestId('quick-order-input').fill(`${HERO_SKU} 2`)
    await page.getByRole('button', { name: 'Validate' }).click()
    await expect(page.getByTestId('quick-order-preview')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`quick-order-line-${HERO_SKU}`)).toContainText('OK')

    await page.getByTestId('quick-order-apply').click()
    await expect(page.getByTestId('quick-order-apply-message')).toContainText(/Added/i)
    const idempotencyKey = await page.getByTestId('quick-order-idempotency-key').inputValue()

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

    try {
      if (!idempotencyKey) return
      await page.goto('/admin/login')
      await page.getByLabel(/^email/i).fill(adminEmail)
      await page.getByLabel(/^password/i).fill(adminPassword)
      await page.getByRole('button', { name: /^login$/i }).click()
      await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'))
      const cookies = await page.context().cookies()
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const rows = await request.get(
        `/api/cart-bulk-adds?where[idempotencyKey][equals]=${encodeURIComponent(idempotencyKey)}&limit=5`,
        { headers: { Cookie: cookieHeader } },
      )
      const body = (await rows.json()) as { docs: Array<{ id: number }> }
      for (const doc of body.docs) {
        await request.delete(`/api/cart-bulk-adds/${doc.id}`, {
          headers: { Cookie: cookieHeader },
        })
      }
    } catch {
      // best-effort cleanup
    }
  })
})
