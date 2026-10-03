import type { Payload, PayloadRequest, TypedUser } from 'payload'

import type { User } from '@/payload-types'

export function createPayloadReq(payload: Payload, user: User | TypedUser | null): PayloadRequest {
  return {
    payload,
    user: user ?? undefined,
  } as PayloadRequest
}
