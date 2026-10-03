// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { countSeedScopeEntities, runSeed } from '@/scripts/seed'

describe('seed idempotency', () => {
  it(
    'running seed twice does not increase entity counts',
    async () => {
      const payloadConfig = await config
      const payload = await getPayload({ config: payloadConfig })

      await runSeed(payload)
      const afterFirst = await countSeedScopeEntities(payload)
      await runSeed(payload)
      const afterSecond = await countSeedScopeEntities(payload)

      expect(afterSecond).toEqual(afterFirst)
      expect(afterFirst.companies).toBeGreaterThanOrEqual(2)
      expect(afterFirst.orders).toBe(1)
      expect(afterFirst.quotes).toBe(1)
      expect(afterFirst.media).toBeGreaterThanOrEqual(1)
    },
    60_000,
  )
})
