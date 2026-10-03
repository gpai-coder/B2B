export type BlobStoreAccess = 'public' | 'private'

/** Which Vercel Blob access mode this deployment uses (matches store type). */
export function blobStoreAccessFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobStoreAccess {
  return env.BLOB_STORE_ACCESS === 'private' ? 'private' : 'public'
}

/** Active store token: private store after cutover, public store before. */
export function blobReadWriteTokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  if (blobStoreAccessFromEnv(env) === 'private') {
    if (!env.BLOB_PRIVATE_READ_WRITE_TOKEN) {
      throw new Error(
        'BLOB_STORE_ACCESS=private requires BLOB_PRIVATE_READ_WRITE_TOKEN (do not fall back to BLOB_READ_WRITE_TOKEN)',
      )
    }
    return env.BLOB_PRIVATE_READ_WRITE_TOKEN
  }
  return env.BLOB_READ_WRITE_TOKEN
}

/** Call at script startup when reading blob env (migration + runtime helpers). */
export function assertBlobStoreEnvConfigured(env: Record<string, string | undefined> = process.env) {
  if (blobStoreAccessFromEnv(env) === 'private' && !env.BLOB_PRIVATE_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_STORE_ACCESS=private requires BLOB_PRIVATE_READ_WRITE_TOKEN (do not fall back to BLOB_READ_WRITE_TOKEN)',
    )
  }
}

/** Options passed to `@payloadcms/storage-vercel-blob` (access cast for plugin types). */
export function blobPluginStorageOptionsFromEnv(env: Record<string, string | undefined> = process.env) {
  const token = blobReadWriteTokenFromEnv(env)
  return {
    enabled: Boolean(token),
    token: token ?? '',
    access: blobStoreAccessFromEnv(env) as 'public',
    addRandomSuffix: false as const,
  }
}

export function blobMigrationSourceToken(env: Record<string, string | undefined> = process.env) {
  return env.BLOB_SOURCE_READ_WRITE_TOKEN ?? env.BLOB_READ_WRITE_TOKEN
}

export function blobMigrationDestToken(env: Record<string, string | undefined> = process.env) {
  return env.BLOB_DEST_READ_WRITE_TOKEN ?? env.BLOB_PRIVATE_READ_WRITE_TOKEN
}
