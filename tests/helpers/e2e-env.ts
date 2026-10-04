/** Playwright targets a deployed site (not local webServer). */
export function isRemotePlaywrightHost(baseURL: string): boolean {
  return !isLocalBaseUrl(baseURL)
}

export function isLocalBaseUrl(baseURL?: string): boolean {
  const raw =
    baseURL ??
    process.env.B2B_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    'http://localhost:3000'
  try {
    const hostname = new URL(raw).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

/** Skip Payload template e2e specs (CI sets B2B_BASE_URL even for localhost smoke). */
export const skipTemplateE2ESpecs = Boolean(process.env.B2B_BASE_URL)
