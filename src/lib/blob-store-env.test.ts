import { describe, expect, it } from 'vitest'

import {
  blobMigrationDestToken,
  blobMigrationSourceToken,
  blobPluginStorageOptionsFromEnv,
  blobReadWriteTokenFromEnv,
  blobStoreAccessFromEnv,
} from '@/lib/blob-store-env'

describe('blobStoreAccessFromEnv', () => {
  it('defaults to public', () => {
    expect(blobStoreAccessFromEnv({})).toBe('public')
    expect(blobStoreAccessFromEnv({ BLOB_STORE_ACCESS: 'private' })).toBe('private')
  })
})

describe('blobReadWriteTokenFromEnv', () => {
  it('uses public token before cutover', () => {
    expect(blobReadWriteTokenFromEnv({ BLOB_READ_WRITE_TOKEN: 'pub' })).toBe('pub')
  })

  it('uses private token after cutover', () => {
    expect(
      blobReadWriteTokenFromEnv({
        BLOB_STORE_ACCESS: 'private',
        BLOB_PRIVATE_READ_WRITE_TOKEN: 'priv',
        BLOB_READ_WRITE_TOKEN: 'pub',
      }),
    ).toBe('priv')
  })
})

describe('blobPluginStorageOptionsFromEnv', () => {
  it('passes private access for the Payload plugin cast', () => {
    const opts = blobPluginStorageOptionsFromEnv({
      BLOB_STORE_ACCESS: 'private',
      BLOB_PRIVATE_READ_WRITE_TOKEN: 'priv-token',
    })
    expect(opts.enabled).toBe(true)
    expect(opts.token).toBe('priv-token')
    expect(opts.access).toBe('private')
    expect(opts.addRandomSuffix).toBe(false)
  })
})

describe('blob migration tokens', () => {
  it('defaults source to public and dest to private env vars', () => {
    expect(blobMigrationSourceToken({ BLOB_READ_WRITE_TOKEN: 'pub' })).toBe('pub')
    expect(blobMigrationDestToken({ BLOB_PRIVATE_READ_WRITE_TOKEN: 'priv' })).toBe('priv')
  })
})
