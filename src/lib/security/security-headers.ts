type HeaderPair = { key: string; value: string }

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** Content-Security-Policy tuned for Payload admin + Next frontend + Vercel Blob media. */
export function buildContentSecurityPolicy(): string {
  const blobHosts = 'https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com'
  const scriptSrc = isProduction()
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${blobHosts}`,
    "font-src 'self' data:",
    `connect-src 'self' ${blobHosts}`,
    `media-src 'self' blob: ${blobHosts}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (isProduction()) {
    directives.push('upgrade-insecure-requests')
  }
  return directives.join('; ')
}

export function buildSecurityHeaders(): HeaderPair[] {
  const headers: HeaderPair[] = [
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy() },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  ]
  if (isProduction()) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    })
  }
  return headers
}
