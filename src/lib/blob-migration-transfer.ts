import { head, put } from '@vercel/blob'

import { openBlobReadStream, type BlobStoreAccess } from '@/lib/blob-server-read'

/** Blob pathname stored on media rows (never pass app URLs to the SDK). */
export function blobPathnameFromMediaFilename(filename: string): string {
  const apiPrefix = '/api/media/file/'
  if (filename.startsWith(apiPrefix)) {
    return decodeURIComponent(filename.slice(apiPrefix.length))
  }
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    try {
      return decodeURIComponent(new URL(filename).pathname.replace(/^\//, ''))
    } catch {
      return filename
    }
  }
  return filename
}

export function formatBlobMigrationFailure(
  phase: 'source-read' | 'dest-write' | 'dest-verify' | 'source-head',
  storeAccess: BlobStoreAccess,
  pathname: string,
  err: unknown,
): string {
  const detail = err instanceof Error ? err.message : String(err)
  return `${detail} (phase=${phase} store=${storeAccess} pathname=${pathname})`
}

/** Same read path as prod `serveBlobFileResponse` / `openBlobReadStream` on the public source store. */
export async function readMigrationSourceObject(
  pathname: string,
  sourceToken: string,
): Promise<{ buffer: Buffer; contentType: string; blobUrl: string; size: number }> {
  const blobPath = blobPathnameFromMediaFilename(pathname)
  const opened = await openBlobReadStream(blobPath, sourceToken, 'public', { useCache: true })
  const buffer = Buffer.from(await new Response(opened.stream).arrayBuffer())
  return {
    buffer,
    contentType: opened.contentType,
    blobUrl: opened.blobUrl,
    size: opened.contentLength,
  }
}

export async function headMigrationSourceObject(pathname: string, sourceToken: string) {
  const blobPath = blobPathnameFromMediaFilename(pathname)
  return head(blobPath, { token: sourceToken })
}

export async function writeMigrationDestObject(
  pathname: string,
  body: Buffer,
  destToken: string,
  contentType: string,
) {
  const blobPath = blobPathnameFromMediaFilename(pathname)
  await put(blobPath, body, {
    access: 'private',
    token: destToken,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

export async function verifyMigrationDestObject(
  pathname: string,
  destToken: string,
  expectedSize: number,
  expectedSha256: string,
  sha256: (buf: Buffer) => Promise<string>,
) {
  const blobPath = blobPathnameFromMediaFilename(pathname)
  const meta = await head(blobPath, { token: destToken })
  if (meta.size !== expectedSize) {
    throw new Error(`Dest size mismatch: ${meta.size} !== ${expectedSize}`)
  }
  const opened = await openBlobReadStream(blobPath, destToken, 'private', { useCache: true })
  const hash = await sha256(Buffer.from(await new Response(opened.stream).arrayBuffer()))
  if (hash !== expectedSha256) {
    throw new Error(`Dest sha256 mismatch for ${blobPath}`)
  }
}
