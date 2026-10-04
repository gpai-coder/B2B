import type { Payload, PayloadRequest } from 'payload'

import { lockAndLoadOrderForUpdate, setOrderClientStatus } from '@/lib/orders/order-workflow'
import { withPayloadTransaction } from '@/lib/orders/payload-transaction'

export async function staffOrderUpdate(
  payload: Payload,
  req: PayloadRequest,
  orderId: number,
  data: Record<string, unknown>,
) {
  const snapshot = await payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 0,
    overrideAccess: true,
  })
  setOrderClientStatus(req, String(snapshot.status ?? 'draft'))
  return withPayloadTransaction(payload, req, async () => {
    await lockAndLoadOrderForUpdate(payload, orderId, req)
    return payload.update({
      collection: 'orders',
      id: orderId,
      data,
      req,
      overrideAccess: true,
    })
  })
}
