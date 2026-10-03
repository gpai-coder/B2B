// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { SEED_HERO_SKU } from '@/scripts/seed'
import { getSearchProvider } from '@/lib/search'

describe('catalog search (postgres)', () => {
  it('finds exact SKU and partial model number', async () => {
    if (!process.env.DATABASE_URL) return

    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const search = getSearchProvider(payload)

    try {
      const bySku = await search.search({ q: SEED_HERO_SKU, pageSize: 10 }, { companyId: '1' })
      expect(bySku.hits.some((h) => h.slug.includes('townsend'))).toBe(true)

      const partial = await search.search({ q: '7353101', pageSize: 10 }, { companyId: '1' })
      expect(partial.hits.some((h) => h.modelNumber === '7353101')).toBe(true)
    } finally {
      await payload.destroy()
    }
  })

  it('finds Townsend with typo townsnd', async () => {
    if (!process.env.DATABASE_URL) return

    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const search = getSearchProvider(payload)

    try {
      const result = await search.search({ q: 'townsnd', pageSize: 10 }, { companyId: '1' })
      expect(result.hits.some((h) => h.name.toLowerCase().includes('townsend'))).toBe(true)
    } finally {
      await payload.destroy()
    }
  })

  it('never returns hidden Delancey kitchen faucet', async () => {
    if (!process.env.DATABASE_URL) return

    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const search = getSearchProvider(payload)

    try {
      const result = await search.search({ q: 'Delancey', pageSize: 20 }, { companyId: '1' })
      expect(result.hits.every((h) => !h.slug.includes('delancey'))).toBe(true)
    } finally {
      await payload.destroy()
    }
  })

  it('respects finish facet filter', async () => {
    if (!process.env.DATABASE_URL) return

    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const search = getSearchProvider(payload)

    try {
      const result = await search.search(
        { q: '7353101', finish: 'Matte Black', pageSize: 10 },
        { companyId: '1' },
      )
      expect(result.hits.length).toBeGreaterThan(0)
    } finally {
      await payload.destroy()
    }
  it('returns the same visible catalog products for any vendor company', async () => {
    if (!process.env.DATABASE_URL) return

    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const search = getSearchProvider(payload)

    try {
      const pacific = await search.search({ q: '7353101', pageSize: 5 }, { companyId: '1' })
      const bay = await search.search({ q: '7353101', pageSize: 5 }, { companyId: '2' })
      expect(pacific.hits.map((h) => h.productId).sort()).toEqual(bay.hits.map((h) => h.productId).sort())
    } finally {
      await payload.destroy()
    }
  })
})
