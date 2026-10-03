import { test, expect } from '@playwright/test'

import { adminJwtHeaders } from '../helpers/admin-api'
import { loginVendor } from '../helpers/vendor-login'

const ADDRESS_LABEL_PREFIX = 'e2e-shipto-zz'
const E2E_LABEL_RE = /^e2e-shipto-zz\d{13}$/
const PACIFIC_COMPANY_NAME = 'Pacific Plumbing Supply'

type CleanupState = {
  addressIds: number[]
}

type DefaultShipToSnapshot = {
  name: string | null
  line1: string | null
  line2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}

type PacificBaseline = {
  companyId: number
  defaultAddressId: number | null
  defaultShipTo: DefaultShipToSnapshot
}

function isClosedRequestError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /Target page, context or browser has been closed|Request context disposed/i.test(msg)
}

async function sweepE2eShipToLabels(request: import('@playwright/test').APIRequestContext) {
  try {
    const headers = await adminJwtHeaders(request)
    const res = await request.get(
      '/api/ship-to-addresses?where[label][like]=e2e-shipto-zz&limit=100&depth=0',
      { headers },
    )
    if (!res.ok()) return
    const body = (await res.json()) as { docs: Array<{ id: number; label?: string }> }
    for (const doc of body.docs) {
      if (!doc.label || !E2E_LABEL_RE.test(doc.label)) continue
      await request.delete(`/api/ship-to-addresses/${doc.id}`, { headers })
    }
  } catch (err) {
    if (!isClosedRequestError(err)) throw err
  }
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

async function readPacificBaseline(request: import('@playwright/test').APIRequestContext): Promise<PacificBaseline> {
  const headers = await adminJwtHeaders(request)
  const companyId = await pacificCompanyId(request)
  const defaults = await defaultAddressIdsForCompany(request, companyId)
  const companyRes = await request.get(`/api/companies/${companyId}?depth=0`, { headers })
  expect(companyRes.ok()).toBeTruthy()
  const company = (await companyRes.json()) as {
    defaultShipTo?: DefaultShipToSnapshot
  }
  const ship: DefaultShipToSnapshot = company.defaultShipTo ?? {
    name: null,
    line1: null,
    line2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
  }
  return {
    companyId,
    defaultAddressId: defaults.length === 1 ? defaults[0]! : null,
    defaultShipTo: {
      name: ship.name ?? null,
      line1: ship.line1 ?? null,
      line2: ship.line2 ?? null,
      city: ship.city ?? null,
      state: ship.state ?? null,
      postalCode: ship.postalCode ?? null,
      country: ship.country ?? null,
    },
  }
}

async function restorePacificBaseline(
  request: import('@playwright/test').APIRequestContext,
  baseline: PacificBaseline,
) {
  const headers = await adminJwtHeaders(request)
  if (baseline.defaultAddressId != null) {
    const rows = await request.get(
      `/api/ship-to-addresses?where[and][0][company][equals]=${baseline.companyId}&where[and][1][isDefault][equals]=true&limit=20&depth=0`,
      { headers },
    )
    const body = (await rows.json()) as { docs: Array<{ id: number }> }
    for (const row of body.docs) {
      if (row.id === baseline.defaultAddressId) continue
      await request.patch(`/api/ship-to-addresses/${row.id}`, {
        headers,
        data: { isDefault: false },
      })
    }
    await request.patch(`/api/ship-to-addresses/${baseline.defaultAddressId}`, {
      headers,
      data: { isDefault: true },
    })
  }
  await request.patch(`/api/companies/${baseline.companyId}`, {
    headers,
    data: { defaultShipTo: baseline.defaultShipTo },
  })
}

async function assertPacificBaselineUnchanged(
  request: import('@playwright/test').APIRequestContext,
  baseline: PacificBaseline,
) {
  const headers = await adminJwtHeaders(request)
  const defaults = await defaultAddressIdsForCompany(request, baseline.companyId)
  if (baseline.defaultAddressId != null) {
    expect(defaults).toEqual([baseline.defaultAddressId])
  }
  const companyRes = await request.get(`/api/companies/${baseline.companyId}?depth=0`, { headers })
  const company = (await companyRes.json()) as { defaultShipTo?: DefaultShipToSnapshot }
  expect(company.defaultShipTo ?? {}).toEqual(baseline.defaultShipTo)
}

test.describe('Account ship-to addresses', () => {
  const cleanup: CleanupState = { addressIds: [] }
  let baseline: PacificBaseline | null = null

  test.beforeAll(async ({ request }) => {
    await sweepE2eShipToLabels(request)
    baseline = await readPacificBaseline(request)
  })

  test.afterAll(async ({ request }) => {
    await deleteAddresses(request, cleanup)
    await sweepE2eShipToLabels(request)
    if (baseline) {
      await restorePacificBaseline(request, baseline)
    }
  })

  test('vendor creates and deletes a non-default address without changing the default', async ({
    page,
    request,
  }) => {
    if (!baseline) {
      test.skip()
      return
    }
    const defaultsBefore = await defaultAddressIdsForCompany(request, baseline.companyId)
    test.skip(defaultsBefore.length !== 1, 'Pacific must have exactly one default address for prod-safe e2e')

    const runMs = Date.now()
    const label = `${ADDRESS_LABEL_PREFIX}${runMs}`
    expect(E2E_LABEL_RE.test(label)).toBe(true)
    const headers = await adminJwtHeaders(request)

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

      await assertPacificBaselineUnchanged(request, baseline)
    } finally {
      await deleteAddresses(request, cleanup)
      await sweepE2eShipToLabels(request)
      if (baseline) {
        await restorePacificBaseline(request, baseline)
        await assertPacificBaselineUnchanged(request, baseline)
      }
    }
  })
})
