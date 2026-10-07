import type { Payload } from 'payload'

import { getAppPayload } from '@/lib/payload/get-app-payload'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import type { User } from '@/payload-types'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export async function vendorPayloadContext(): Promise<
  { error: string } | { user: User; companyId: string; payload: Payload }
> {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    return { error: 'Authentication required.' }
  }
  if (!user.approved) {
    return { error: PENDING_APPROVAL }
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) return { error: 'Vendor account is missing a company.' }
  const payload = await getAppPayload()
  return { user, companyId, payload }
}
