import { describe, it, expect, beforeAll } from 'vitest'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'
import { runSeed, SEED_MEDIA_FILENAME } from '@/scripts/seed'
import { findMediaByStorageName } from '@/scripts/seed-catalog-loader'

describe('catalog media collection access', () => {
  let pacificUserId: number
  let bayUserId: number
  let mediaId: number

  beforeAll(async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    await runSeed(payload)

    const media = await findMediaByStorageName(payload, SEED_MEDIA_FILENAME)
    if (!media) {
      throw new Error(`Seed media not found for ${SEED_MEDIA_FILENAME}`)
    }
    mediaId = media.id

    const pacificUser = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local' } },
      limit: 1,
      overrideAccess: true,
    })
    const bayUser = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_VENDOR_B_EMAIL ?? 'buyer@bay-fixtures.local' } },
      limit: 1,
      overrideAccess: true,
    })
    pacificUserId = pacificUser.docs[0]!.id
    bayUserId = bayUser.docs[0]!.id
  })

  it('approved vendor can read seeded spec PDF media', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const user = await payload.findByID({ collection: 'users', id: pacificUserId, overrideAccess: true })

    const result = await payload.find({
      collection: 'media',
      where: { id: { equals: mediaId } },
      overrideAccess: false,
      req: createPayloadReq(payload, user),
    })
    expect(result.docs).toHaveLength(1)
  })

  it('pending vendor cannot read media', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const user = await payload.findByID({ collection: 'users', id: bayUserId, overrideAccess: true })

    await expect(
      payload.find({
        collection: 'media',
        where: { id: { equals: mediaId } },
        overrideAccess: false,
        req: createPayloadReq(payload, user),
      }),
    ).rejects.toThrow(/not allowed/i)
  })

  it('unauthenticated local API query returns no media', async () => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    await expect(
      payload.find({
        collection: 'media',
        where: { id: { equals: mediaId } },
        overrideAccess: false,
        req: createPayloadReq(payload, null),
      }),
    ).rejects.toThrow(/not allowed/i)
  })
})
