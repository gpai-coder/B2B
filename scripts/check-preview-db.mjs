#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Preview-only guard: refuse migrate when DATABASE_URL (or unpooled) targets a prod host.
 * Never log full connection strings or credentials.
 */

export function parseDatabaseHost(connectionString) {
  const raw = connectionString?.trim()
  if (!raw) return null
  try {
    const normalized = raw.replace(/^postgres:\/\//, 'postgresql://')
    return new URL(normalized).hostname || null
  } catch {
    return null
  }
}

export function hostEpId(hostname) {
  if (!hostname) return '(unknown)'
  const segment = hostname.split('.')[0]
  return segment || hostname
}

export function hostMatchesProdEntry(hostname, prodEntry) {
  const host = hostname.toLowerCase()
  const entry = prodEntry.toLowerCase()
  if (!entry) return false
  if (host === entry) return true
  const epId = host.split('.')[0]
  return epId === entry
}

export function checkPreviewDbIsolation(env) {
  const prodHostsRaw = env.PROD_DB_HOSTS ?? ''
  const prodHosts = prodHostsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (prodHosts.length === 0) {
    return {
      ok: false,
      exitCode: 1,
      stderr:
        'error: PROD_DB_HOSTS is missing or empty; refusing preview migrate without production host allowlist.',
    }
  }

  const sources = [
    ['DATABASE_URL', env.DATABASE_URL],
    ['DATABASE_URL_UNPOOLED', env.DATABASE_URL_UNPOOLED],
  ]

  const parsedHosts = []
  for (const [label, value] of sources) {
    if (!value?.trim()) continue
    const host = parseDatabaseHost(value)
    if (!host) {
      return {
        ok: false,
        exitCode: 1,
        stderr: `error: could not parse database hostname from ${label}; refusing preview migrate.`,
      }
    }
    parsedHosts.push({ label, host })
    for (const prodEntry of prodHosts) {
      if (hostMatchesProdEntry(host, prodEntry)) {
        return {
          ok: false,
          exitCode: 1,
          stderr:
            'error: preview database hostname matches an entry in PROD_DB_HOSTS; refusing preview migrate.',
        }
      }
    }
  }

  if (!env.DATABASE_URL?.trim()) {
    return {
      ok: false,
      exitCode: 1,
      stderr: 'error: DATABASE_URL is missing; refusing preview migrate.',
    }
  }

  if (parsedHosts.length === 0) {
    return {
      ok: false,
      exitCode: 1,
      stderr: 'error: no database hostname available to verify; refusing preview migrate.',
    }
  }

  const epIds = [...new Set(parsedHosts.map(({ host }) => hostEpId(host)))]
  const stdout = `Preview DB isolation check passed (ep-id: ${epIds.join(', ')})`
  return { ok: true, exitCode: 0, stdout }
}

function runCli() {
  const result = checkPreviewDbIsolation(process.env)
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
