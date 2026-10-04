import { test, expect } from '@playwright/test'

const REQUIRED_HEADERS = [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
  'x-robots-tag',
] as const

function expectHttpsSite(): boolean {
  const base = process.env.B2B_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
  try {
    return new URL(base).protocol === 'https:'
  } catch {
    return false
  }
}

test.describe('security headers (read-only)', () => {
  for (const path of ['/login', '/catalog', '/admin/login']) {
    test(`GET ${path} includes hardening headers`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status()).toBeLessThan(500)
      const headers = res.headers()
      for (const name of REQUIRED_HEADERS) {
        expect(headers[name], `missing ${name}`).toBeTruthy()
      }
      if (expectHttpsSite()) {
        expect(headers['strict-transport-security']).toBeTruthy()
      }
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(headers['x-robots-tag']).toMatch(/noindex/i)
    })
  }

  test('robots.txt disallows all crawlers', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toMatch(/Disallow:\s*\//i)
  })
})
