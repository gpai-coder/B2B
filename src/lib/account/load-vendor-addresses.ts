import { getAppPayload } from '@/lib/payload/get-app-payload'
import { listVendorShipToAddresses } from '@/lib/vendor/ship-to-addresses'
import type { User } from '@/payload-types'

export async function loadVendorAddresses(user: User, companyId: string) {
  const payload = await getAppPayload()
  return listVendorShipToAddresses(payload, user, companyId)
}
