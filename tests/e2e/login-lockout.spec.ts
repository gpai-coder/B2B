import { test, expect } from '@playwright/test'

import { isLocalBaseUrl } from '../helpers/e2e-env'

test.describe('login lockout (localhost only)', () => {
  test.skip(!isLocalBaseUrl(), 'uses temporary users via local API only')

  test('shows generic failure copy for bad credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/^email/i).fill(`nobody-${Date.now()}@local.test`)
    await page.getByLabel(/^password/i).fill('not-a-real-password')
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(page.getByRole('alert')).toContainText('Invalid email or password.')
  })
})
