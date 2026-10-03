// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { resolveCatalogDefaultPricingForProducts } from '@/lib/catalog/catalog-default-pricing'
import { SEED_HERO_SKU } from '@/scripts/seed'
import { getSearchProvider } from '@/lib/search'

describe('catalog search (postgres)', () => {
  let payload: Payload

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterAll(async () => {
    if (payload) await payload.destroy()
  })

  it('finds exact SKU and partial model number', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)

    const bySku = await search.search({ q: SEED_HERO_SKU, pageSize: 10 }, { companyId: '1' })
    expect(bySku.hits.some((h) => h.slug.includes('townsend'))).toBe(true)

    const partial = await search.search({ q: '7353101', pageSize: 10 }, { companyId: '1' })
    expect(partial.hits.some((h) => h.modelNumber === '7353101')).toBe(true)
  })

  it('finds Townsend with typo townsnd', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)
    const result = await search.search({ q: 'townsnd', pageSize: 10 }, { companyId: '1' })
    expect(result.hits.some((h) => h.name.toLowerCase().includes('townsend'))).toBe(true)
  })

  it('never returns hidden Delancey kitchen faucet', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)
    const result = await search.search({ q: 'Delancey', pageSize: 20 }, { companyId: '1' })
    expect(result.hits.every((h) => !h.slug.includes('delancey'))).toBe(true)
  })

  it('treats malicious finish and special q as data (no error, no broadened results)', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)

    const baseline = await search.search({ q: '7353101', pageSize: 50 }, { companyId: '1' })
    expect(baseline.hits.length).toBeGreaterThan(0)

    const benignFinish = await search.search(
      {
        q: "7353101' \\ % $&",
        finish: '__no_such_finish__',
        pageSize: 50,
      },
      { companyId: '1' },
    )

    const injected = await search.search(
      {
        q: "7353101' \\ % $&",
        finish: "x\\' OR 1=1 --",
        pageSize: 50,
      },
      { companyId: '1' },
    )

    expect(injected.hits.map((h) => h.productId).sort()).toEqual(
      benignFinish.hits.map((h) => h.productId).sort(),
    )
    expect(injected.hits.length).toBeLessThanOrEqual(baseline.hits.length)
  })

  it('respects finish facet filter', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)
    const result = await search.search(
      { q: '7353101', finish: 'Matte Black', pageSize: 10 },
      { companyId: '1' },
    )
    expect(result.hits.length).toBeGreaterThan(0)
  })

  it('returns the same visible catalog products for any vendor company', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)
    const pacific = await search.search({ q: '7353101', pageSize: 5 }, { companyId: '1' })
    const bay = await search.search({ q: '7353101', pageSize: 5 }, { companyId: '2' })
    expect(pacific.hits.map((h) => h.productId).sort()).toEqual(bay.hits.map((h) => h.productId).sort())
  })

  it('category facet counts match distinct products (not summed per finish)', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)
    const result = await search.search({ q: '7353101', pageSize: 50 }, { companyId: '1' })
    expect(result.hits.length).toBeGreaterThan(0)

    const categoryTotal = result.facets.categories.reduce((sum, row) => sum + row.count, 0)
    expect(categoryTotal).toBe(result.hits.length)
    expect(result.facets.categories.find((c) => c.value === 'bathroom-faucet')?.count).toBe(
      result.hits.length,
    )
  })

  it('uses PLP default SKU and Pacific contract price for Townsend search pricing', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)
    const result = await search.search({ q: '7353101', pageSize: 10 }, { companyId: '1' })
    const hit = result.hits.find((h) => h.modelNumber === '7353101')
    expect(hit).toBeDefined()

    const users = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const vendor = users.docs[0]
    expect(vendor).toBeDefined()

    const { defaultSkuByProduct, priceBySku } = await resolveCatalogDefaultPricingForProducts({
      payload,
      user: vendor!,
      companyId: '1',
      productIds: [hit!.productId],
    })

    expect(defaultSkuByProduct.get(hit!.productId)).toBe(SEED_HERO_SKU)
    expect(priceBySku.get(SEED_HERO_SKU)?.unitPrice.amount).toBe(199)
  })

  it('loads hidden Delancey product by slug for PDP (not in search)', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    const search = getSearchProvider(payload)
    const slug = 'delancey-r-single-handle-pull-down-dual-spray-function-kitchen-faucet-1-5-gpm-5-7-l-min'
    const found = await payload.find({
      collection: 'products',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    expect(found.docs[0]?.catalogHidden).toBe(true)

    const searchResult = await search.search({ q: 'Delancey', pageSize: 20 }, { companyId: '1' })
    expect(searchResult.hits.some((h) => h.slug === slug)).toBe(false)

    const variants = await payload.find({
      collection: 'product-variants',
      where: { product: { equals: found.docs[0]!.id } },
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
    expect(variants.docs.length).toBeGreaterThan(0)
    expect(variants.docs.every((v) => v.discontinued === true)).toBe(true)
  })
})
