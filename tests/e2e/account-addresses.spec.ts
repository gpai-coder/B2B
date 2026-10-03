import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { loginVendor } from '../helpers/vendor-login'

const ADDRESS_LABEL_PREFIX = 'e2e-shipto-zz'
const PACIFIC_COMPANY_NAME = 'Pacific Plumbing Supply'

type CleanupState = {
  addressIds: number[]
}

function isClosedRequestError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /Target page, context or browser has been closed|Request context disposed/i.test(msg)
}

async function deleteAddresses(request: import('@playwright/test').APIRequestContext, state: CleanupState) {
  if (state.addressIds.length === 0) return
  try {
    const headers = await adminJwtHeaders(request)
    for (const id of [...state.addressIds]) {
      const res = await request.delete(`/api/ship-to-addresses/${id}`, { headers })
      if (res.ok() || res.status() === 404) {
        state.addressIds = state.addressIds.filter((x) => x !== id)
      }
    }
  } catch (err) {
    if (!isClosedRequestError(err)) throw err
  }
}

async function pacificCompanyId(request: import('@playwright/test').APIRequestContext) {
  const headers = await adminJwtHeaders(request)
  const res = await request.get(
    `/api/companies?where[name][equals]=${encodeURIComponent(PACIFIC_COMPANY_NAME)}&limit=1&depth=0`,
    { headers },
  )
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { docs: Array<{ id: number }> }
  const id = body.docs[0]?.id
  expect(id).toBeTruthy()
  return id!
}

async function defaultAddressIdsForCompany(
  request: import('@playwright/test').APIRequestContext,
  companyId: number,
) {
  const headers = await adminJwtHeaders(request)
  const res = await request.get(
    `/api/ship-to-addresses?where[and][0][company][equals]=${companyId}&where[and][1][isDefault][equals]=true&limit=10&depth=0`,
    { headers },
  )
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { docs: Array<{ id: number }> }
  return body.docs.map((d) => d.id).sort()
}

test.describe('Account ship-to addresses', () => {
  const cleanup: CleanupState = { addressIds: [] }

  test.afterAll(async ({ request }) => {
    await deleteAddresses(request, cleanup)
  })

  test('vendor creates and deletes a non-default address without changing the default', async ({
    page,
    request,
  }) => {
    const runMs = Date.now()
    const label = `${ADDRESS_LABEL_PREFIX}${runMs}`
    const headers = await adminJwtHeaders(request)
    const companyId = await pacificCompanyId(request)
    const defaultsBefore = await defaultAddressIdsForCompany(request, companyId)

    try {
      await loginVendor(page, '/account/addresses')
      await expect(page.getByTestId('account-addresses-page')).toBeVisible()

      await page.getByTestId('account-address-new-label').fill(label)
      await page.getByTestId('account-address-new-name').fill(`${label} Receiving`)
      await page.locator('.as-address-create input[name="line1"]').fill('900 E2E Lane')
      await page.locator('.as-address-create input[name="city"]').fill('San Francisco')
      await page.locator('.as-address-create input[name="state"]').fill('CA')
      await page.locator('.as-address-create input[name="postalCode"]').fill('94108')
      await page.getByTestId('account-address-create').click()

      const row = page.locator('li[data-testid^="account-address-"]').filter({ hasText: label })
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('account-addresses-error')).toHaveCount(0)

      const rowTestId = await row.getAttribute('data-testid')
      expect(rowTestId).toMatch(/^account-address-\d+$/)
      const addressId = Number(rowTestId!.replace('account-address-', ''))
      cleanup.addressIds.push(addressId)

      const created = await request.get(`/api/ship-to-addresses/${addressId}?depth=0`, { headers })
      expect(created.ok()).toBeTruthy()
      const doc = (await created.json()) as { isDefault?: boolean }
      expect(doc.isDefault).toBe(false)
      const deleteBtn = page.getByTestId(`account-address-delete-${addressId}`)
      await expect(deleteBtn).toBeEnabled({ timeout: 15_000 })
      await deleteBtn.click()

      await expect(row).toHaveCount(0, { timeout: 30_000 })
      await expect.poll(async () => {
        const deleted = await request.get(`/api/ship-to-addresses/${addressId}`, { headers })
        return deleted.status()
      }, { timeout: 15_000 }).toBe(404)
      cleanup.addressIds = cleanup.addressIds.filter((id) => id !== addressId)

      const defaultsAfter = await defaultAddressIdsForCompany(request, companyId)
      expect(defaultsAfter).toEqual(defaultsBefore)
    } finally {
      await deleteAddresses(request, cleanup)
    }
  })
})
