import type { Payload, PayloadRequest } from 'payload'

const TRUSTED_ORDER_EVENT = 'trustedOrderEventMutation'

export function markTrustedOrderEventReq(req: PayloadRequest): void {
  req.context = { ...(req.context as Record<string, unknown>), [TRUSTED_ORDER_EVENT]: true }
}

function isTrustedOrderEventReq(req: PayloadRequest): boolean {
  return Boolean((req.context as Record<string, unknown> | undefined)?.[TRUSTED_ORDER_EVENT])
}

export async function appendOrderStatusEvent(args: {
  payload: Payload
  req: PayloadRequest
  orderId: number
  companyId: number
  fromStatus: string
  toStatus: string
  actorId: number | null
  note?: string | null
}): Promise<void> {
  markTrustedOrderEventReq(args.req)
  await args.payload.create({
    collection: 'order-events',
    data: {
      order: args.orderId,
      company: args.companyId,
      kind: 'status_change',
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      actor: args.actorId,
      note: args.note ?? undefined,
    },
    req: args.req,
    overrideAccess: true,
  })
}

export async function listOrderEventsForOrder(
  payload: Payload,
  orderId: number,
  req: PayloadRequest,
): Promise<Array<Record<string, unknown>>> {
  const rows = await payload.find({
    collection: 'order-events',
    where: { order: { equals: orderId } },
    sort: 'createdAt',
    limit: 200,
    req,
    overrideAccess: false,
  })
  return rows.docs as unknown as Array<Record<string, unknown>>
}

export function assertOrderEventCreateIsTrusted(req: PayloadRequest): void {
  if (!isTrustedOrderEventReq(req)) {
    throw new Error('Order events are append-only via server hooks.')
  }
}
