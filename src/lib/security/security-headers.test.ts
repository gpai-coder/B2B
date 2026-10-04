import { describe, expect, it } from 'vitest'

import { buildContentSecurityPolicy, buildSecurityHeaders } from '@/lib/security/security-headers'

describe('security headers', () => {
  it('includes frame-ancestors none in CSP', () => {
    expect(buildContentSecurityPolicy()).toContain("frame-ancestors 'none'")
  })

  it('sets baseline security headers', () => {
    const keys = buildSecurityHeaders().map((h) => h.key)
    expect(keys).toContain('X-Content-Type-Options')
    expect(keys).toContain('Referrer-Policy')
    expect(keys).toContain('Permissions-Policy')
    expect(keys).toContain('X-Robots-Tag')
  })
})
