# Vendor media pipeline

## Supported path

1. **URL in UI** — `vendorMediaPath(mediaId)` from `@/lib/media` → `/api/vendor/media/:id`
2. **Streaming** — `GET app/api/vendor/media/[id]/route.ts` resolves Payload `media`, then `resolveBlobMediaUrl` + `serveBlobFileResponse`
3. **Admin / Payload uploads** — `(payload)/api/media/file/[...path]` uses the same `serveBlobFileResponse` helper

Do not construct blob CDN URLs in React components. Do not add parallel vendor media API routes.

## Enforcement

- Components import `@/lib/media` only (not `@/lib/product-media` or `@/lib/blob-media-url` directly).
- Access: `getCatalogMediaAuthFailure` in the vendor media route.
