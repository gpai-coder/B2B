/**
 * Removes embedded stylesheet markup and loose CSS blocks from catalog import text.
 */
export function sanitizeProductDescription(raw: string | null | undefined): string {
  if (!raw) return ''

  let text = raw

  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')

  // Shopify-style trailing rules appended to plain-text descriptions.
  text = text.replace(/\.\s*[\w-]+(?:\s+[\w.#\[\]:(),-]+)*\s*\{[^}]*\}/g, '')
  text = text.replace(/@media[^{]+\{[^}]*\}/gi, '')

  return text.replace(/\s{2,}/g, ' ').trim()
}
