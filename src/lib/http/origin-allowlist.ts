import { getEnv } from '@/env'

const PRODUCTION_HOST = 'b2b-gamma-seven.vercel.app'

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin
  } catch {
    return null
  }
}

function originFromEnvUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const raw = value.trim()
  const withScheme = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
  return normalizeOrigin(withScheme)
}

export function allowedPayloadOrigins(): string[] {
  const list = new Set<string>([`https://${PRODUCTION_HOST}`, 'http://localhost:3000'])

  try {
    const env = getEnv()
    const fromPublic = originFromEnvUrl(env.NEXT_PUBLIC_SERVER_URL)
    if (fromPublic) list.add(fromPublic)
  } catch {
    const fromPublic = originFromEnvUrl(process.env.NEXT_PUBLIC_SERVER_URL)
    if (fromPublic) list.add(fromPublic)
  }

  for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL'] as const) {
    const o = originFromEnvUrl(process.env[key])
    if (o) list.add(o)
  }

  return [...list]
}

export function isAllowedPayloadOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true
  const normalized = normalizeOrigin(origin)
  if (!normalized) return false
  return allowedPayloadOrigins().includes(normalized)
}

export function assertAllowedPayloadOrigin(origin: string | null | undefined): void {
  if (isAllowedPayloadOrigin(origin)) return
  throw new Error('Origin not allowed.')
}

export function requestUsesCookieAuth(headers: Headers): boolean {
  const auth = headers.get('Authorization')
  if (auth?.startsWith('JWT ') || auth?.startsWith('Bearer ')) return false
  return true
}
