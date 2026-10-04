import { describe, expect, it } from 'vitest'

import {
  dbFingerprintFromDatabaseUrl,
  fingerprintHostname,
} from './db-fingerprint'

describe('dbFingerprintFromDatabaseUrl', () => {
  const secret = 'must-not-appear-in-fingerprint'
  const baseHost = 'ep-branch-abc123.us-east-2.aws.neon.tech'
  const pooledHost = 'ep-branch-abc123-pooler.us-east-2.aws.neon.tech'

  it('returns first 12 hex chars of sha256(normalized hostname)', () => {
    const fp = dbFingerprintFromDatabaseUrl(
      `postgresql://user:${secret}@${baseHost}/neondb`,
    )
    expect(fp).toMatch(/^[a-f0-9]{12}$/)
    expect(fp).toBe(dbFingerprintFromDatabaseUrl(`postgresql://x@${baseHost}/db`))
  })

  it('treats pooled and unpooled first labels as the same fingerprint', () => {
    const unpooled = dbFingerprintFromDatabaseUrl(
      `postgresql://user:${secret}@${baseHost}/neondb`,
    )
    const pooled = dbFingerprintFromDatabaseUrl(
      `postgresql://user:${secret}@${pooledHost}/neondb`,
    )
    expect(unpooled).toBe(pooled)
  })

  it('does not embed hostname or credentials in the fingerprint', () => {
    const fp = dbFingerprintFromDatabaseUrl(
      `postgresql://leak-user:${secret}@${baseHost}/neondb`,
    )
    expect(fp).not.toContain('leak-user')
    expect(fp).not.toContain(secret)
    expect(fp).not.toContain('ep-branch')
  })

  it('normalizes fingerprint hostname labels', () => {
    expect(fingerprintHostname('EP-Branch-ABC123-Pooler.us-east-2.aws.neon.tech')).toBe(
      'ep-branch-abc123.us-east-2.aws.neon.tech',
    )
  })
})
