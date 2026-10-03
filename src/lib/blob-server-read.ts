import { get } from '@vercel/blob'

export type BlobStoreAccess = 'public' | 'private'

export class BlobReadError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'BlobReadError'
    this.cause = cause
  }
}

/** Which Vercel Blob access mode this deployment reads (matches store type after env swap). */
export function blobStoreAccessFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobStoreAccess {
  return env.BLOB_STORE_ACCESS === 'private' ? 'private' : 'public'
}

export type OpenBlobReadResult = {
  stream: ReadableStream<Uint8Array>
  contentType: string
  contentLength: number
  etag: string
}

/**
 * Stream a blob via the store token. Uses CDN cache for public blobs (Vercel default).
 * Does not buffer the full object in memory.
 */
export async function openBlobReadStream(
  pathname: string,
  token: string,
  access: BlobStoreAccess = blobStoreAccessFromEnv(),
): Promise<OpenBlobReadResult> {
  try {
    const result = await get(pathname, {
      access,
      token,
      useCache: true,
    })

    if (!result) {
      throw new BlobReadError(`Blob not found: ${pathname}`)
    }
    const status = result.statusCode
    if (status === 304) {
      throw new BlobReadError(`Unexpected 304 for full read: ${pathname}`)
    }
    if (status !== 200 || !result.stream) {
      throw new BlobReadError(`Blob read failed with status ${status}: ${pathname}`)
    }

    return {
      stream: result.stream,
      contentType: result.blob.contentType ?? 'application/octet-stream',
      contentLength: result.blob.size,
      etag: result.blob.etag,
    }
  } catch (err) {
    if (err instanceof BlobReadError) throw err
    throw new BlobReadError(`Failed to read blob ${pathname}`, err)
  }
}
