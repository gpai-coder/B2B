import { get } from '@vercel/blob'

import { blobStoreAccessFromEnv, type BlobStoreAccess } from '@/lib/blob-store-env'

export { blobStoreAccessFromEnv, type BlobStoreAccess } from '@/lib/blob-store-env'

export class BlobReadError extends Error {
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'BlobReadError'
    this.cause = cause
  }
}

export type OpenBlobReadResult = {
  stream: ReadableStream<Uint8Array>
  contentType: string
  contentLength: number
  etag: string
  blobUrl: string
}

export type OpenBlobReadStreamOptions = {
  useCache?: boolean
}

/**
 * Stream a blob via the store token. Uses CDN cache for public blobs (Vercel default).
 * Does not buffer the full object in memory.
 */
export async function openBlobReadStream(
  pathname: string,
  token: string,
  access: BlobStoreAccess = blobStoreAccessFromEnv(),
  streamOptions: OpenBlobReadStreamOptions = {},
): Promise<OpenBlobReadResult> {
  const useCache = streamOptions.useCache ?? true
  try {
    const result = await get(pathname, {
      access,
      token,
      useCache,
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
      blobUrl: result.blob.url,
    }
  } catch (err) {
    if (err instanceof BlobReadError) throw err
    throw new BlobReadError(`Failed to read blob ${pathname}`, err)
  }
}
