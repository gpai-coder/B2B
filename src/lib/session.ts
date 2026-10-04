import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'

import type { User } from '@/payload-types'
import { vendorBuyerIsApproved } from '@/lib/access/vendor-gate'

export async function getRequestUser(): Promise<User | null> {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers: await getHeaders() })
  if (!user || !('role' in user)) return null
  const fresh = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
  })
  return fresh as User
}

export function getCompanyIdFromUser(user: User): string | null {
  if (!user.company) return null
  return typeof user.company === 'object' ? String(user.company.id) : String(user.company)
}

export function assertVendorPortalAccess(user: User | null): user is User {
  if (!user || user.role !== 'vendor-buyer') return false
  return vendorBuyerIsApproved(user)
}
