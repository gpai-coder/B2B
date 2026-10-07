import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { Company } from '@/payload-types'
import type { User } from '@/payload-types'

export async function loadAccountCompany(user: User, companyId: string): Promise<Company> {
  const payload = await getAppPayload()
  return payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
}
