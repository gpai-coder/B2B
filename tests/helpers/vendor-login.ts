import { expect, type Page } from '@playwright/test'

const defaultEmail = process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local'
const defaultPassword = process.env.SEED_VENDOR_A_PASSWORD ?? 'local-dev-vendor-a-password'

/** Sign in as an approved vendor and wait until navigation leaves /login. */
export async function loginVendor(
  page: Page,
  nextPath: string,
  credentials?: { email?: string; password?: string },
): Promise<void> {
  const email = credentials?.email ?? defaultEmail
  const password = credentials?.password ?? defaultPassword
  const next = nextPath.startsWith('/') ? nextPath : `/${nextPath}`

  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
}

/** After loginVendor, assert the browser reached a product path (not login with ?next=). */
export async function expectVendorOnPath(page: Page, pathPrefix: string): Promise<void> {
  await expect(page).toHaveURL(
    (url) => !url.pathname.includes('/login') && url.pathname.includes(pathPrefix),
    { timeout: 15_000 },
  )
}
