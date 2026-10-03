import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { loginVendor } from '../helpers/vendor-login'

const ADDRESS_LABEL_PREFIX = 'e2e-shipto-zz'

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
    const pacificLists = await request.get(
      '/api/quotes?where[quoteNumber][equals]=Q-2026-0001&limit=1&depth=0',
      { headers },
    )
    expect(pacificLists.ok()).toBeTruthy()

    const defaultsBefore = await request.get(
      '/api/ship-to-addresses?where[isDefault][equals]=true&limit=50&depth=0',
      { headers },
    )
    expect(defaultsBefore.ok()).toBeTruthy()
    const defaultIdsBefore = ((await defaultsBefore.json()) as { docs: Array<{ id: number }> }).docs.map(
      (d) => d.id,
    )

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
      await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 })

      const created = await request.get(
        `/api/ship-to-addresses?where[label][equals]=${encodeURIComponent(label)}&limit=1&depth=0`,
        { headers },
      )
      expect(created.ok()).toBeTruthy()
      const doc = ((await created.json()) as { docs: Array<{ id: number; isDefault?: boolean }> }).docs[0]
      expect(doc).toBeTruthy()
      expect(doc!.isDefault).toBe(false)
      cleanup.addressIds.push(doc!.id)

      const rowTestId = `account-address-${doc!.id}`
      await expect(page.getByTestId(rowTestId)).toBeVisible()
      await page.getByTestId(`account-address-delete-${doc!.id}`).click()
      await expect(page.getByTestId(rowTestId)).toHaveCount(0, { timeout: 15_000 })
      cleanup.addressIds = cleanup.addressIds.filter((id) => id !== doc!.id)

      const defaultsAfter = await request.get(
        '/api/ship-to-addresses?where[isDefault][equals]=true&limit=50&depth=0',
        { headers },
      )
      expect(defaultsAfter.ok()).toBeTruthy()
      const defaultIdsAfter = ((await defaultsAfter.json()) as { docs: Array<{ id: number }> }).docs.map(
        (d) => d.id,
      )
      expect(defaultIdsAfter.sort()).toEqual(defaultIdsBefore.sort())
    } finally {
      await deleteAddresses(request, cleanup)
    }
  })
})
