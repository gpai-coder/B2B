import type { Payload, PayloadRequest } from 'payload'

import { withPayloadTransaction } from '@/lib/orders/payload-transaction'

export type BoundedUniqueRetryOptions = {
  maxAttempts?: number
  isCollision: (err: unknown) => boolean
}

const DEFAULT_ATTEMPTS = 3

/**
 * Retries work on unique violations using a fresh transaction per attempt (same pattern as checkout).
 */
export async function runBoundedUniqueRetry<T>(
  payload: Payload,
  req: PayloadRequest,
  fn: () => Promise<T>,
  options: BoundedUniqueRetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_ATTEMPTS
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await withPayloadTransaction(payload, req, fn)
    } catch (err) {
      lastErr = err
      if (options.isCollision(err) && attempt < maxAttempts - 1) continue
      throw err
    }
  }
  throw lastErr ?? new Error('Unique retry exhausted.')
}
