import { describe, expect, it, vi, afterEach } from 'vitest'

import { allowedPayloadOrigins, isAllowedPayloadOrigin } from './origin-allowlist'

const PROD = 'https://b2b-gamma-seven.vercel.app'

describe('origin allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows production host, configured Vercel URL, and localhost', () => {
    vi.stubEnv('VERCEL_URL', 'b2b-gamma-seven.vercel.app')
    vi.stubEnv('VERCEL_BRANCH_URL', 'b2b-git-cursor-admin-pr-a-gpai1.vercel.app')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'http://localhost:3000')

    expect(isAllowedPayloadOrigin(PROD)).toBe(true)
    expect(isAllowedPayloadOrigin('https://b2b-gamma-seven.vercel.app')).toBe(true)
    expect(isAllowedPayloadOrigin('http://localhost:3000')).toBe(true)
    expect(allowedPayloadOrigins()).toContain('https://b2b-git-cursor-admin-pr-a-gpai1.vercel.app')
  })

  it('rejects unrelated vercel.app hosts', () => {
    vi.stubEnv('VERCEL_URL', 'b2b-gamma-seven.vercel.app')
    expect(isAllowedPayloadOrigin('https://attacker.vercel.app')).toBe(false)
    expect(isAllowedPayloadOrigin('https://b2b-evil-gpai1.vercel.app')).toBe(false)
  })
})
