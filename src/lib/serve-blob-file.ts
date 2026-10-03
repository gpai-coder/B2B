import {
  blobReadWriteTokenFromEnv,
  blobStoreAccessFromEnv,
  type BlobStoreAccess,
} from '@/lib/blob-store-env'
import { BlobReadError, openBlobReadStream } from '@/lib/blob-server-read'

type ServeBlobFileArgs = {
  filename: string
  mimeType?: string | null
  disposition: 'inline' | 'attachment'
  token?: string
  access?: BlobStoreAccess
}

export async function serveBlobFileResponse({
  filename,
  mimeType,
  disposition,
  token = blobReadWriteTokenFromEnv(),
  access = blobStoreAccessFromEnv(),
}: ServeBlobFileArgs): Promise<Response> {
  if (!token) {
    return Response.json({ error: 'Blob store not configured' }, { status: 503 })
  }

  try {
    const opened = await openBlobReadStream(filename, token, access)
    const headers = new Headers({
      'Content-Type': mimeType ?? opened.contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(opened.contentLength),
    })
    return new Response(opened.stream, { headers })
  } catch (err) {
    const message = err instanceof BlobReadError ? err.message : 'Failed to read blob'
    console.error('[media/blob]', { filename, err })
    return Response.json({ error: message }, { status: 502 })
  }
}
