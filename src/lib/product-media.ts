import type { Media } from '@/payload-types'

export function vendorMediaPath(mediaId: number | string, options?: { download?: boolean }) {
  const q = options?.download ? '?download=1' : ''
  return `/api/vendor/media/${mediaId}${q}`
}

export function resolveMediaId(
  value: number | Media | null | undefined,
): number | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

export function mediaAlt(value: number | Media | null | undefined, fallback: string): string {
  if (value != null && typeof value === 'object' && value.alt) return value.alt
  return fallback
}
