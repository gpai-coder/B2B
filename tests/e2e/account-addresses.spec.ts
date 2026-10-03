import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { loginVendor } from '../helpers/vendor-login'

const ADDRESS_LABEL_PREFIX = 'e2e-shipto-zz'
const PACIFIC_COMPANY_NAME = 'Pacific Plumbing Supply'

type CleanupState = {
  addressIds: number[]
}

async function deleteAddresses(request: import('@playwright/test').APIRequestContext, state: CleanupState) {
  if (state.addressIds.length === 0) return
  const headers = await adminJwtHeaders(request)
  for (const id of [...state.addressIds]) {
    const res = await request.delete(`/api/ship-to-addresses/${id}`, { headers })
    if (res.ok() || res.status() === 404) {
      state.addressIds = state.addressIds.filter((x) => x !== id)
    }
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

      await expect.poll(async () => {
        const created = await request.get(
          `/api/ship-to-addresses?where[label][equals]=${encodeURIComponent(label)}&limit=1&depth=0`,
          { headers },
        )
        if (!created.ok()) return 0
        return ((await created.json()) as { docs: unknown[] }).docs.length
      }).toBe(1)

      const created = await request.get(
        `/api/ship-to-addresses?where[label][equals]=${encodeURIComponent(label)}&limit=1&depth=0`,
        { headers },
      )
      const doc = ((await created.json()) as { docs: Array<{ id: number; isDefault?: boolean }> }).docs[0]
      expect(doc!.isDefault).toBe(false)
      cleanup.addressIds.push(doc!.id)

      const rowTestId = `account-address-${doc!.id}`
      await expect(page.getByTestId(rowTestId)).toBeVisible({ timeout: 15_000 })
      await page.getByTestId(`account-address-delete-${doc!.id}`).click()

      await expect.poll(async () => {
        const row = await request.get(`/api/ship-to-addresses/${doc!.id}`, { headers })
        return row.status()
      }).toBe(404)
      cleanup.addressIds = cleanup.addressIds.filter((id) => id !== doc!.id)

      const defaultsAfter = await defaultAddressIdsForCompany(request, companyId)
      expect(defaultsAfter).toEqual(defaultsBefore)
    } finally {
      await deleteAddresses(request, cleanup)
    }
  })
})
