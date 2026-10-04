import { createHash } from 'node:crypto'

export function parseDatabaseHostname(connectionString) {
  const raw = connectionString?.trim()
  if (!raw) return null
  try {
    const normalized = raw.replace(/^postgres:\/\//, 'postgresql://')
    return new URL(normalized).hostname || null
  } catch {
    return null
  }
}

/** Hostname for fingerprint: lowercase, `-pooler` removed from first label only. */
export function fingerprintHostname(hostname) {
  const lower = hostname.toLowerCase()
  const labels = lower.split('.')
  if (labels[0]?.endsWith('-pooler')) {
    labels[0] = labels[0].slice(0, -'-pooler'.length)
  }
  return labels.join('.')
}

export function dbFingerprintFromDatabaseUrl(connectionString) {
  const host = parseDatabaseHostname(connectionString)
  if (!host) return null
  const material = fingerprintHostname(host)
  return createHash('sha256').update(material).digest('hex').slice(0, 12)
}
