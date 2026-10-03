/**
 * Resolve the absolute URL for a media file stored by @payloadcms/storage-vercel-blob.
 * @deprecated Prefer `readBlobFile()` — public URLs must not be exposed to clients after migration.
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
