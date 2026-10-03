/** Playwright targets a deployed site (not local webServer). */
export function isRemotePlaywrightHost(baseURL: string): boolean {
  return !baseURL.includes('localhost') && !baseURL.includes('127.0.0.1')
}

/** Skip Payload template e2e specs (CI sets B2B_BASE_URL even for localhost smoke). */
export const skipTemplateE2ESpecs = Boolean(process.env.B2B_BASE_URL)
