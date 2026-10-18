import { config as loadEnv } from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../..')

export function loadVerificationEnv() {
  const envLocal = path.join(repoRoot, '.env.local')
  if (fs.existsSync(envLocal)) {
    loadEnv({ path: envLocal })
  }
  loadEnv({ path: path.join(repoRoot, '.env') })
}

export function baseUrl() {
  return (
    process.env.VERIFY_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    process.env.NEXT_PUBLIC_SERVER_URL ??
    'http://127.0.0.1:3000'
  ).replace(/\/$/, '')
}

export function artifactsDir(runId) {
  const dir = path.join(repoRoot, 'artifacts', 'verify-b2b-portal', runId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function repoRootPath() {
  return repoRoot
}

export function isLocalDatabaseUrl(databaseUrl) {
  if (!databaseUrl?.trim()) return false
  const match = databaseUrl.match(/@([^/?:]+)/)
  const hostname = match?.[1] ?? ''
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}
