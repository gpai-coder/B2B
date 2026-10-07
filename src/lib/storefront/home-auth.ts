import { headers as getHeaders } from 'next/headers'

import { getAppPayload } from '@/lib/payload/get-app-payload'

export async function getHomeAuthEmail(): Promise<string | null> {
  const headers = await getHeaders()
  const payload = await getAppPayload()
  const { user } = await payload.auth({ headers })
  if (user && 'email' in user && user.email) {
    return String(user.email)
  }
  return null
}
