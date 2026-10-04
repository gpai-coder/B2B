import { getEnv } from '@/env'

const PRODUCTION_HOST = 'b2b-gamma-seven.vercel.app'

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin
  } catch {
    return null
  }
}

export function allowedPayloadOrigins(): string[] {
  const env = getEnv()
  const list = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    `https://${PRODUCTION_HOST}`,
  ])
  if (env.NEXT_PUBLIC_SERVER_URL) {
    const o = normalizeOrigin(env.NEXT_PUBLIC_SERVER_URL)
    if (o) list.add(o)
  }
  return [...list]
}

export function isAllowedPayloadOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true
  const normalized = normalizeOrigin(origin)
  if (!normalized) return false
  if (allowedPayloadOrigins().includes(normalized)) return true
  try {
    const host = new URL(normalized).hostname
    if (host.endsWith('.vercel.app')) return true
  } catch {
    return false
  }
  return false
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
