import { test, expect } from '@playwright/test'
import { skipTemplateE2ESpecs } from '../helpers/e2e-env'

const describeFrontend = skipTemplateE2ESpecs ? test.describe.skip : test.describe

describeFrontend('Frontend', () => {
  test('can go on homepage', async ({ page }) => {
    await page.goto('http://localhost:3000')

    await expect(page).toHaveTitle(/Payload Blank Template/)

    const heading = page.locator('h1').first()

    await expect(heading).toHaveText('Welcome to your new project.')
  })
})
