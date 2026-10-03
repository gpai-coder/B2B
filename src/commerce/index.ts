import { getPayload } from 'payload'

import config from '@/payload.config'

import { createPostgresCommerceService } from './postgres'
import type { CommerceService } from './types'

import type { User } from '@/payload-types'

type GetCommerceOptions = {
  /** Authenticated user for access-controlled reads. Omit only in trusted server/tests after auth checks. */
  user?: User | null
}

/** Single entry point for pricing/quotes/orders (swap implementation for MuleSoft later). */
export async function getCommerce(options: GetCommerceOptions = {}): Promise<CommerceService> {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  return createPostgresCommerceService(payload, options.user ?? null)
}

export type { CommerceService, CommerceOrder, CommerceQuote, PriceQuote, CartSummary, QuickOrderPreview, QuickOrderApplyResult } from './types'
export { CartValidationError } from './postgres'
