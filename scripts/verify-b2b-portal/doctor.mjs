#!/usr/bin/env node
/**
 * Read-only preflight for verify-b2b-portal. Never logs secrets or full DATABASE_URL.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { baseUrl, isLocalDatabaseUrl, loadVerificationEnv, repoRootPath } from './lib/env.mjs'

loadVerificationEnv()

const errors = []

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  errors.push('DATABASE_URL is missing (copy .env.example → .env.local).')
} else if (!isLocalDatabaseUrl(databaseUrl)) {
  const check = spawnSync('node', ['scripts/check-preview-db.mjs'], {
    cwd: repoRootPath(),
    env: process.env,
    encoding: 'utf8',
  })
  if (check.status !== 0) {
    errors.push(
      'Non-local DATABASE_URL failed scripts/check-preview-db.mjs (preview/prod isolation). Refusing to verify against production-like Neon.',
    )
  }
}

const url = `${baseUrl()}/api/health`
let health
try {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  health = await res.json().catch(() => null)
  if (!res.ok || health?.db !== 'connected') {
    errors.push(`Health check failed at ${url} (status=${res.status}, db=${health?.db ?? 'unknown'}).`)
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  errors.push(`Health check unreachable at ${url}: ${msg}`)
}

if (errors.length > 0) {
  process.stderr.write('verify-b2b-portal doctor: FAIL\n')
  for (const e of errors) {
    process.stderr.write(`  - ${e}\n`)
  }
  process.exit(1)
}

process.stdout.write('verify-b2b-portal doctor: OK\n')
process.stdout.write(`  baseURL=${baseUrl()}\n`)
if (health?.version) {
  process.stdout.write(`  version=${health.version}\n`)
}
if (health?.dbFingerprint) {
  process.stdout.write(`  dbFingerprint=${health.dbFingerprint}\n`)
}
