import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'

/** Server-side Payload instance (storefront must use domain loaders, not import getPayload). */
export async function getAppPayload(): Promise<Payload> {
  const payloadConfig = await config
  return getPayload({ config: payloadConfig })
}
