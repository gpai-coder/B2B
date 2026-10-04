import { describe, expect, it, vi } from 'vitest'

import { dbFingerprintFromDatabaseUrl } from './db-fingerprint.mjs'
import { checkPreviewDbIsolation } from './check-preview-db.mjs'

const secret = 'super-secret-password-12345'
const previewHost = 'ep-preview-branch-abc123.us-east-2.aws.neon.tech'
const prodHost = 'ep-production-main-xyz789.us-east-2.aws.neon.tech'

function env(overrides: Record<string, string | undefined>) {
  return {
    DATABASE_URL: `postgresql://user:${secret}@${previewHost}/neondb`,
    ...overrides,
  }
}

function combinedOutput(result: Awaited<ReturnType<typeof checkPreviewDbIsolation>>) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

describe('checkPreviewDbIsolation', () => {
  it('fails when preview fingerprint equals production', async () => {
    const prodFp = dbFingerprintFromDatabaseUrl(`postgresql://x@${prodHost}/db`)!
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ dbFingerprint: prodFp }),
    })
    const result = await checkPreviewDbIsolation(
      env({
        DATABASE_URL: `postgresql://user:${secret}@${prodHost}/neondb`,
      }),
      { fetch },
    )
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/matches production/)
  })

  it('normalizes pooled vs unpooled preview URLs to the same fingerprint', async () => {
    const pooledHost = 'ep-preview-branch-abc123-pooler.us-east-2.aws.neon.tech'
    const previewFp = dbFingerprintFromDatabaseUrl(`postgresql://x@${previewHost}/db`)!
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ dbFingerprint: '000000000000' }),
    })
    const result = await checkPreviewDbIsolation(
      env({
        DATABASE_URL: `postgresql://user:${secret}@${pooledHost}/neondb`,
        DATABASE_URL_UNPOOLED: `postgresql://user:${secret}@${previewHost}/neondb`,
      }),
      { fetch },
    )
    expect(result.ok).toBe(true)
    expect(result.stdout).toContain(`DATABASE_URL=${previewFp}`)
    expect(result.stdout).toContain(`DATABASE_URL_UNPOOLED=${previewFp}`)
  })

  it('fails closed when production health is unreachable', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await checkPreviewDbIsolation(env({}), { fetch })
    expect(result.ok).toBe(false)
    expect(result.stderr).toMatch(/unreachable/)
  })

  it('fails closed when production returns 200 without dbFingerprint', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ status: 'ok', db: 'connected' }),
    })
    const result = await checkPreviewDbIsolation(env({}), { fetch })
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/no dbFingerprint \(HTTP 200\)/)
  })

  it('fails closed when production returns HTTP 200 with unparseable JSON', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    })
    const result = await checkPreviewDbIsolation(env({}), { fetch })
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/unparseable or non-object JSON/)
  })

  it('fails closed when production returns HTTP 200 with non-object JSON', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => 'not-an-object',
    })
    const result = await checkPreviewDbIsolation(env({}), { fetch })
    expect(result.ok).toBe(false)
    expect(result.stderr).toMatch(/unparseable or non-object JSON/)
  })

  it('fails when production health lacks dbFingerprint and is not HTTP 200', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 503,
      json: async () => ({ status: 'degraded' }),
    })
    const result = await checkPreviewDbIsolation(env({}), { fetch })
    expect(result.ok).toBe(false)
    expect(result.stderr).toMatch(/no dbFingerprint/)
  })

  it('passes when preview fingerprints differ from production', async () => {
    const prodFp = dbFingerprintFromDatabaseUrl(`postgresql://x@${prodHost}/db`)!
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ dbFingerprint: prodFp }),
    })
    const result = await checkPreviewDbIsolation(env({}), { fetch })
    expect(result.ok).toBe(true)
    expect(result.stdout).toMatch(/^Preview DB isolation check passed/)
    expect(result.stdout).toContain(`prod=${prodFp}`)
  })

  it('does not echo credentials or hostnames in output', async () => {
    const prodFp = dbFingerprintFromDatabaseUrl(`postgresql://x@${prodHost}/db`)!
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ dbFingerprint: prodFp }),
    })
    const result = await checkPreviewDbIsolation(
      env({
        DATABASE_URL: `postgresql://leak-user:${secret}@${previewHost}/neondb`,
        DATABASE_URL_UNPOOLED: `postgresql://leak-user:${secret}@${previewHost}/neondb`,
      }),
      { fetch },
    )
    expect(result.ok).toBe(true)
    const combined = combinedOutput(result)
    expect(combined).toContain('Preview DB isolation check passed')
    expect(combined).not.toContain(secret)
    expect(combined).not.toContain('leak-user')
    expect(combined).not.toContain(previewHost)
    expect(combined).not.toContain(prodHost)
    expect(combined).not.toContain('postgresql://')
  })
})
