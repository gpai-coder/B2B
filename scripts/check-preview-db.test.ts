import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import { checkPreviewDbIsolation } from './check-preview-db.mjs'

const previewHost = 'ep-preview-branch-abc123.us-east-2.aws.neon.tech'
const prodHost = 'ep-production-main-xyz789.us-east-2.aws.neon.tech'
const secret = 'super-secret-password-12345'

function env(overrides: Record<string, string | undefined>) {
  return {
    PROD_DB_HOSTS: prodHost,
    DATABASE_URL: `postgresql://user:${secret}@${previewHost}/neondb?sslmode=require`,
    ...overrides,
  }
}

describe('checkPreviewDbIsolation', () => {
  it('fails when DATABASE_URL host matches PROD_DB_HOSTS', () => {
    const result = checkPreviewDbIsolation(
      env({
        DATABASE_URL: `postgresql://user:${secret}@${prodHost}/neondb`,
        PROD_DB_HOSTS: prodHost,
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/matches an entry in PROD_DB_HOSTS/)
  })

  it('fails when DATABASE_URL_UNPOOLED host matches PROD_DB_HOSTS', () => {
    const result = checkPreviewDbIsolation(
      env({
        DATABASE_URL_UNPOOLED: `postgresql://user:${secret}@${prodHost}/neondb`,
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
  })

  it('fails when PROD_DB_HOSTS is missing or empty', () => {
    expect(checkPreviewDbIsolation(env({ PROD_DB_HOSTS: '' })).ok).toBe(false)
    expect(checkPreviewDbIsolation(env({ PROD_DB_HOSTS: undefined })).ok).toBe(false)
  })

  it('passes when preview host differs from production allowlist', () => {
    const result = checkPreviewDbIsolation(env({}))
    expect(result.ok).toBe(true)
    expect(result.stdout).toBe('Preview DB isolation check passed (ep-id: ep-preview-branch-abc123)')
  })

  it('CLI output does not echo credentials or full URLs', () => {
    const run = spawnSync('node', ['scripts/check-preview-db.mjs'], {
      env: {
        ...process.env,
        PROD_DB_HOSTS: prodHost,
        DATABASE_URL: `postgresql://leak-user:${secret}@${previewHost}/neondb`,
        DATABASE_URL_UNPOOLED: `postgresql://leak-user:${secret}@${previewHost}/neondb`,
      },
      encoding: 'utf8',
    })
    expect(run.status).toBe(0)
    const combined = `${run.stdout ?? ''}${run.stderr ?? ''}`
    expect(combined).toContain('Preview DB isolation check passed')
    expect(combined).not.toContain(secret)
    expect(combined).not.toContain('leak-user')
    expect(combined).not.toContain(previewHost)
    expect(combined).toContain('ep-preview-branch-abc123')
  })
})
