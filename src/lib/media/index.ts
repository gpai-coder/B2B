/**
 * Single supported surface for vendor-visible catalog media URLs and streaming helpers.
 * Bytes are served from GET /api/vendor/media/[id] only.
 */

export { resolveBlobMediaUrl } from '@/lib/blob-media-url'
export { mediaAlt, resolveMediaId, vendorMediaPath } from '@/lib/product-media'
export { serveBlobFileResponse } from '@/lib/serve-blob-file'
