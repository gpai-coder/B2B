import { get } from '@vercel/blob'

export type BlobFileAccess = 'public' | 'private'

export function blobFileAccessFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobFileAccess {
  return env.BLOB_FILE_ACCESS === 'private' ? 'private' : 'public'
}

/**
 * Read blob bytes using the store token (works for public and private objects).
 * During migration, tries configured access then the opposite once.
 */
export async function readBlobFile(
  pathname: string,
  token: string,
  access: BlobFileAccess = blobFileAccessFromEnv(),
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  for (const mode of [access, access === 'public' ? 'private' : 'public'] as const) {
    try {
      const result = await get(pathname, { access: mode, token, useCache: false })
      if (!result || result.statusCode !== 200 || !result.stream) continue
      const data = await new Response(result.stream).arrayBuffer()
      const contentType = result.blob.contentType ?? 'application/octet-stream'
      return { data, contentType }
    } catch {
      /* try next mode */
    }
  }
  return null
}
