import type { SearchSort } from './types'
import {
  buildRankExpression,
  buildTextMatchClause,
  catalogVisibilityWhere,
  sanitizeSearchQuery,
} from './postgres-query'

export type BuiltSearchSql = {
  q: string
  listSql: string
  countSql: string
  facetSql: string
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildSearchSql(args: {
  rawQ: string
  category?: string
  finish?: string
  showDiscontinued: boolean
  limit: number
  offset: number
  sort: SearchSort
}): BuiltSearchSql | null {
  const q = sanitizeSearchQuery(args.rawQ)
  if (!q) return null

  const qLit = sqlQuote(q)
  const rankExpr = buildRankExpression().replace(/\$1/g, qLit)
  const textMatch = buildTextMatchClause().replace(/\$1/g, qLit)
  const visibility = catalogVisibilityWhere(args.showDiscontinued)

  const filters: string[] = [visibility, textMatch]
  if (args.category) {
    filters.push(`p.catalog_category = ${sqlQuote(args.category)}`)
  }
  if (args.finish) {
    filters.push(`EXISTS (
      SELECT 1 FROM product_variants pv_f
      WHERE pv_f.product_id = p.id AND pv_f.finish = ${sqlQuote(args.finish)}
    )`)
  }

  const where = filters.join(' AND ')
  const orderBy =
    args.sort === 'name'
      ? 'p.name ASC, p.id ASC'
      : `${rankExpr} DESC, p.name ASC, p.id ASC`

  const listSql = `
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
    LIMIT ${Math.max(1, Math.min(args.limit, 50))}
    OFFSET ${Math.max(0, args.offset)}
  `

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM products p
    WHERE ${where}
  `

  const facetSql = `
    SELECT
      p.catalog_category AS category,
      pv.finish AS finish,
      COUNT(DISTINCT p.id)::int AS cnt
    FROM products p
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    WHERE ${where}
    GROUP BY p.catalog_category, pv.finish
  `

  return { q, listSql, countSql, facetSql }
}
