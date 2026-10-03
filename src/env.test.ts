import { describe, it, expect } from 'vitest'

import { getEnv } from './env'

describe('env validation', () => {
  it('loads required variables from process.env', () => {
    const env = getEnv()
    expect(env.DATABASE_URL).toContain('postgresql')
    expect(env.PAYLOAD_SECRET.length).toBeGreaterThanOrEqual(16)
  })
})
