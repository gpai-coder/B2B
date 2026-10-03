// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPostgresCommerceService } from '@/commerce/postgres'
import { SEED_HERO_SKU, SEED_PACIFIC_PRICE_LIST, SEED_QUOTE_SECOND_SKU } from '@/scripts/seed'

describe('price list name on quotes', () => {
  let payload: Payload
  let pacificCompanyId: string
  let pacificUserId: number

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
    const pacific = await payload.find({
      collection: 'companies',
      where: { name: { equals: 'Pacific Plumbing Supply' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificCompanyId = String(pacific.docs[0]!.id)
    const user = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificUserId = user.docs[0]!.id
  })

  it('includes contract list name for company-priced SKUs only', async () => {
    if (!process.env.DATABASE_URL || !payload) return
    const user = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })
    const commerce = createPostgresCommerceService(payload, user)
    const prices = await commerce.getPrices(pacificCompanyId, [SEED_HERO_SKU, SEED_QUOTE_SECOND_SKU])
    const hero = prices.find((p) => p.sku === SEED_HERO_SKU)
    const champion = prices.find((p) => p.sku === SEED_QUOTE_SECOND_SKU)
    expect(hero?.source).toBe('company')
    expect(hero?.priceListName).toBe(SEED_PACIFIC_PRICE_LIST)
    expect(champion?.source).toBe('standard')
    expect(champion?.priceListName).toBeUndefined()
  })
})
