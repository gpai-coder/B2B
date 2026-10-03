/**
 * Resolve the absolute URL for a media file stored by @payloadcms/storage-vercel-blob.
 * Payload returns a relative `/api/media/file/<filename>` URL for Blob-backed uploads, so the
 * vendor media proxy cannot fetch `doc.url` directly. Mirrors the adapter's base URL logic.
 */
export function resolveBlobMediaUrl(
  filename: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const base =
    env.STORAGE_VERCEL_BLOB_BASE_URL ||
    (() => {
      const storeId = env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([a-z\d]+)_[a-z\d]+$/i)?.[1]
      return storeId ? `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null
    })()
  if (!base) return null
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(filename)}`
}
