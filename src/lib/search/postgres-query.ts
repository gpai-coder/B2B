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

export function buildRankExpression(): string {
  return `GREATEST(
    COALESCE(ts_rank_cd(p.search_vector, websearch_to_tsquery('english', $1)), 0),
    COALESCE(similarity(COALESCE(p.model_number, ''), $1), 0),
    COALESCE((
      SELECT MAX(GREATEST(similarity(pv.sku, $1), similarity(COALESCE(pv.name, ''), $1)))
      FROM product_variants pv
      WHERE pv.product_id = p.id
    ), 0)
  )`
}

export function buildTextMatchClause(): string {
  return `(
    p.search_vector @@ websearch_to_tsquery('english', $1)
    OR COALESCE(p.model_number, '') ILIKE ($1 || '%')
    OR COALESCE(p.model_number, '') % $1
    OR similarity(COALESCE(p.name, ''), $1) > ${TRGM_SIMILARITY_THRESHOLD}
    OR word_similarity($1, COALESCE(p.name, '')) > 0.35
    OR EXISTS (
      SELECT 1 FROM product_variants pv
      WHERE pv.product_id = p.id
        AND (
          pv.sku ILIKE ($1 || '%')
          OR pv.sku % $1
          OR similarity(pv.sku, $1) > ${TRGM_SIMILARITY_THRESHOLD}
          OR similarity(COALESCE(pv.name, ''), $1) > ${TRGM_SIMILARITY_THRESHOLD}
        )
    )
  )`
}

export function catalogVisibilityWhere(showDiscontinued: boolean): string {
  const discontinuedClause = showDiscontinued
    ? 'TRUE'
    : `EXISTS (
        SELECT 1 FROM product_variants pv_vis
        WHERE pv_vis.product_id = p.id
          AND COALESCE(pv_vis.discontinued, false) = false
      )`
  return `(COALESCE(p.catalog_hidden, false) = false AND ${discontinuedClause})`
}
