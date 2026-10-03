import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'

import type { User } from '@/payload-types'

export async function getRequestUser(): Promise<User | null> {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers: await getHeaders() })
  if (!user || !('role' in user)) return null
  return user as User
}

export function getCompanyIdFromUser(user: User): string | null {
  if (!user.company) return null
  return typeof user.company === 'object' ? String(user.company.id) : String(user.company)
}
