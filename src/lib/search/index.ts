import type { Payload } from 'payload'

import { createPostgresSearchProvider } from './postgres-provider'
import type { SearchProvider } from './provider'

export function getSearchProvider(payload: Payload): SearchProvider {
  return createPostgresSearchProvider(payload)
}

export * from './types'
export type { SearchProvider } from './provider'
