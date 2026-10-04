#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { dbFingerprintFromDatabaseUrl, parseDatabaseHostname } from './db-fingerprint.mjs'

const DEFAULT_PROD_HEALTH_URL = 'https://b2b-gamma-seven.vercel.app/api/health'
const FETCH_TIMEOUT_MS = 10_000
const FETCH_RETRIES = 2

/**
 * Preview-only guard: refuse migrate when preview DB fingerprint matches production.
 * Never log hosts, credentials, or full DATABASE_URL values.
 *
 * Escape hatch (remove after production serves dbFingerprint): HTTP 200 without
 * dbFingerprint logs a warning and allows migrate for chicken-and-egg on first deploy.
 */

export async function fetchProdDbFingerprint(prodHealthUrl, fetchFn = globalThis.fetch) {
  let lastError = 'unknown error'
  const attempts = FETCH_RETRIES + 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchFn(prodHealthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const body = await response.json().catch(() => null)
      return { response, body, error: null }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt < attempts - 1) continue
    }
  }
  return { response: null, body: null, error: lastError }
}

export async function checkPreviewDbIsolation(env, options = {}) {
  const fetchFn = options.fetch ?? globalThis.fetch
  const prodHealthUrl = env.PROD_HEALTH_URL?.trim() || DEFAULT_PROD_HEALTH_URL

  if (!env.DATABASE_URL?.trim()) {
    return {
      ok: false,
      exitCode: 1,
      stderr: 'error: DATABASE_URL is missing; refusing preview migrate.',
    }
  }

  const previewFingerprints = []
  for (const [label, value] of [
    ['DATABASE_URL', env.DATABASE_URL],
    ['DATABASE_URL_UNPOOLED', env.DATABASE_URL_UNPOOLED],
  ]) {
    if (!value?.trim()) continue
    if (!parseDatabaseHostname(value)) {
      return {
        ok: false,
        exitCode: 1,
        stderr: `error: could not parse database hostname from ${label}; refusing preview migrate.`,
      }
    }
    const fp = dbFingerprintFromDatabaseUrl(value)
    if (!fp) {
      return {
        ok: false,
        exitCode: 1,
        stderr: `error: could not compute db fingerprint from ${label}; refusing preview migrate.`,
      }
    }
    previewFingerprints.push({ label, fp })
  }

  const { response, body, error } = await fetchProdDbFingerprint(prodHealthUrl, fetchFn)

  if (!response) {
    return {
      ok: false,
      exitCode: 1,
      stderr: `error: production health check unreachable; refusing preview migrate (${error}).`,
    }
  }

  const prodFingerprint =
    body && typeof body.dbFingerprint === 'string' ? body.dbFingerprint.trim() : ''

  if (!prodFingerprint) {
    if (response.status === 200) {
      if (!isHealthJsonObject(body)) {
        return {
          ok: false,
          exitCode: 1,
          stderr:
            'error: production health returned an unparseable or non-object JSON body; refusing preview migrate.',
        }
      }
      return {
        ok: true,
        exitCode: 0,
        warn:
          'WARNING: production /api/health returned 200 without dbFingerprint (pre-deploy). Continuing preview migrate. Remove this escape hatch after production serves dbFingerprint.',
        stdout:
          'Preview DB isolation check skipped: production dbFingerprint pending (pre-deploy); continuing preview migrate.',
      }
    }
    return {
      ok: false,
      exitCode: 1,
      stderr: `error: production health has no dbFingerprint (HTTP ${response.status}); refusing preview migrate.`,
    }
  }

  if (response.status !== 200) {
    return {
      ok: false,
      exitCode: 1,
      stderr: `error: production health returned HTTP ${response.status}; refusing preview migrate.`,
    }
  }

  for (const { fp } of previewFingerprints) {
    if (fp === prodFingerprint) {
      return {
        ok: false,
        exitCode: 1,
        stderr:
          'error: preview database fingerprint matches production; refusing preview migrate.',
      }
    }
  }

  return {
    ok: true,
    exitCode: 0,
    stdout: formatPassLine(previewFingerprints, prodFingerprint),
  }
}

function isHealthJsonObject(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
}

function formatPassLine(previewFingerprints, prodFingerprint) {
  const parts = previewFingerprints.map(({ label, fp }) => `${label}=${fp}`)
  return `Preview DB isolation check passed (${parts.join('; ')}; prod=${prodFingerprint})`
}

async function runCli() {
  const result = await checkPreviewDbIsolation(process.env)
  if (result.warn) {
    process.stderr.write(`${result.warn}\n`)
  }
  if (result.stderr) {
    process.stderr.write(`${result.stderr}\n`)
  }
  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`)
  }
  process.exit(result.exitCode)
}

const isDirectRun =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  runCli()
}
