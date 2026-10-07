import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { User } from '@/payload-types'

export async function loadCheckoutDefaultShipTo(user: User, companyId: string) {
  const payload = await getAppPayload()
  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
  return { shipTo: shipToFromCompanyDefault(company.defaultShipTo) }
}
