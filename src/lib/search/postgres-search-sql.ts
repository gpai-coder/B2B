import { sql } from '@payloadcms/db-postgres'

import type { SearchSort } from './types'
import { sanitizeSearchQuery, TRGM_SIMILARITY_THRESHOLD } from './postgres-query'

type BoundSql = ReturnType<typeof sql>

export type { BoundSql }

export type BuiltSearchSql = {
  q: string
  listSql: BoundSql
  countSql: BoundSql
  categoryFacetSql: BoundSql
  finishFacetSql: BoundSql
}

function rankExpression(q: string): BoundSql {
  return sql`GREATEST(
    COALESCE(ts_rank_cd(p.search_vector, websearch_to_tsquery('english', ${q})), 0),
    COALESCE(similarity(COALESCE(p.model_number, ''), ${q}), 0),
    COALESCE((
      SELECT MAX(GREATEST(similarity(pv.sku, ${q}), similarity(COALESCE(pv.name, ''), ${q})))
      FROM product_variants pv
      WHERE pv.product_id = p.id
    ), 0)
  )`
}

function textMatchClause(q: string): BoundSql {
  return sql`(
    p.search_vector @@ websearch_to_tsquery('english', ${q})
    OR COALESCE(p.model_number, '') ILIKE (${q} || '%')
    OR COALESCE(p.model_number, '') % ${q}
    OR similarity(COALESCE(p.name, ''), ${q}) > ${TRGM_SIMILARITY_THRESHOLD}
    OR word_similarity(${q}, COALESCE(p.name, '')) > 0.35
    OR EXISTS (
      SELECT 1 FROM product_variants pv
      WHERE pv.product_id = p.id
        AND (
          pv.sku ILIKE (${q} || '%')
          OR pv.sku % ${q}
          OR similarity(pv.sku, ${q}) > ${TRGM_SIMILARITY_THRESHOLD}
          OR similarity(COALESCE(pv.name, ''), ${q}) > ${TRGM_SIMILARITY_THRESHOLD}
        )
    )
  )`
}

function catalogVisibilityWhere(showDiscontinued: boolean): BoundSql {
  if (showDiscontinued) {
    return sql`(COALESCE(p.catalog_hidden, false) = false)`
  }
  return sql`(
    COALESCE(p.catalog_hidden, false) = false
    AND EXISTS (
      SELECT 1 FROM product_variants pv_vis
      WHERE pv_vis.product_id = p.id
        AND COALESCE(pv_vis.discontinued, false) = false
    )
  )`
}

function whereClause(args: {
  q: string
  category?: string
  finish?: string
  showDiscontinued: boolean
}): BoundSql {
  const parts: BoundSql[] = [
    catalogVisibilityWhere(args.showDiscontinued),
    textMatchClause(args.q),
  ]
  if (args.category) {
    parts.push(sql`p.catalog_category = ${args.category}`)
  }
  if (args.finish) {
    parts.push(sql`EXISTS (
      SELECT 1 FROM product_variants pv_f
      WHERE pv_f.product_id = p.id AND pv_f.finish = ${args.finish}
    )`)
  }
  return sql.join(parts, sql` AND `)
}

/** Static SQL text only (bound values appear as $n placeholders, not inlined). */
export function searchQuerySqlText(query: BoundSql): string {
  const config = {
    casing: { getColumnCasing: () => '' },
    escapeName: (name: string) => `"${name}"`,
    escapeParam: () => '?',
    escapeString: () => '?',
    inlineParams: false,
  } as unknown as Parameters<BoundSql['toQuery']>[0]
  return query.toQuery(config).sql
}

export function buildSearchSql(args: {
  rawQ: string
  category?: string
  finish?: string
  showDiscontinued: boolean
  limit?: number
  offset?: number
  sort: SearchSort
}): BuiltSearchSql | null {
  const q = sanitizeSearchQuery(args.rawQ)
  if (!q) return null

  const where = whereClause({
    q,
    category: args.category,
    finish: args.finish,
    showDiscontinued: args.showDiscontinued,
  })

  const rankExpr = rankExpression(q)
  const orderBy =
    args.sort === 'name'
      ? sql`p.name ASC, p.id ASC`
      : sql`${rankExpr} DESC, p.name ASC, p.id ASC`

  const pagination =
    args.limit != null
      ? sql`LIMIT ${Math.max(1, Math.min(args.limit, 50))} OFFSET ${Math.max(0, args.offset ?? 0)}`
      : sql``

  const listSql = sql`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.model_number,
      p.primary_image_id,
      ${rankExpr} AS score
    FROM products p
    WHERE ${where}
    ORDER BY ${orderBy}
    ${pagination}
  `

  const countSql = sql`
    SELECT COUNT(*)::int AS total
    FROM products p
    WHERE ${where}
  `

  const categoryFacetSql = sql`
    SELECT
      p.catalog_category AS category,
      COUNT(DISTINCT p.id)::int AS cnt
    FROM products p
    WHERE ${where}
    GROUP BY p.catalog_category
  `

  const finishFacetSql = sql`
    SELECT
      pv.finish AS finish,
      COUNT(DISTINCT p.id)::int AS cnt
    FROM products p
    INNER JOIN product_variants pv ON pv.product_id = p.id
      AND COALESCE(pv.discontinued, false) = false
    WHERE ${where}
    GROUP BY pv.finish
  `

  return { q, listSql, countSql, categoryFacetSql, finishFacetSql }
}
