import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { OrderEvent } from '@/payload-types'
import type { User } from '@/payload-types'

export async function loadOrderDetailEvents(user: User, orderId: string): Promise<OrderEvent[]> {
  const payload = await getAppPayload()
  const req = createPayloadReq(payload, user)
  const events = await payload.find({
    collection: 'order-events',
    where: { order: { equals: Number(orderId) } },
    sort: 'createdAt',
    limit: 50,
    req,
    overrideAccess: false,
  })
  return events.docs
}
