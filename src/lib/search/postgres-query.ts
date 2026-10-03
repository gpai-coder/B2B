export const SEARCH_MAX_QUERY_LENGTH = 128

export function sanitizeSearchQuery(raw: string): string {
  const trimmed = raw.trim().slice(0, SEARCH_MAX_QUERY_LENGTH)
  return trimmed.replace(/[^\w\s.\-/]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function isEmptySearchQuery(q: string): boolean {
  return sanitizeSearchQuery(q).length === 0
}

/** Minimum pg_trgm similarity for fuzzy name / SKU matches. */
export const TRGM_SIMILARITY_THRESHOLD = 0.2
