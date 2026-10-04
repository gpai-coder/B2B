import { test, expect } from '@playwright/test'

import { isLocalBaseUrl } from '../helpers/e2e-env'

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'

test.describe('admin CSP (localhost)', () => {
  test.skip(!isLocalBaseUrl(), 'requires local admin login')

  test('staff admin UI does not trigger gravatar img-src CSP violations', async ({ page }) => {
    const gravatarViolations: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (/content security policy/i.test(text) && /gravatar/i.test(text)) {
        gravatarViolations.push(text)
      }
    })

    await page.goto('/admin/login')
    await page.getByLabel(/^email$/i).fill(adminEmail)
    await page.getByLabel(/^password$/i).fill(adminPassword)
    await page.getByRole('button', { name: /^login$/i }).click()
    await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'))

    await page.goto('/admin')
    await expect(page.locator('#nav').first()).toBeVisible({ timeout: 30_000 })

    expect(gravatarViolations).toEqual([])
  })
})
