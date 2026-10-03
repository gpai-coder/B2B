import { describe, expect, it } from 'vitest'

import { swapNodeEnvForPayloadConnect } from '@/lib/blob-migrate-payload-env'

describe('swapNodeEnvForPayloadConnect', () => {
  it('restores NODE_ENV after the callback scope', () => {
    const env: Record<string, string | undefined> = { NODE_ENV: 'production' }
    const restore = swapNodeEnvForPayloadConnect(env)
    expect(env.NODE_ENV).toBe('test')
    restore()
    expect(env.NODE_ENV).toBe('production')
  })

  it('does not change NODE_ENV when not production', () => {
    const env: Record<string, string | undefined> = { NODE_ENV: 'development' }
    const restore = swapNodeEnvForPayloadConnect(env)
    expect(env.NODE_ENV).toBe('development')
    restore()
    expect(env.NODE_ENV).toBe('development')
  })
})
