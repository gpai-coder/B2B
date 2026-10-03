import type { PriceDTO } from './types'

type VariantLike = { sku: string; inStock: boolean; discontinued: boolean }

/** First in-stock variant in catalog order, preferring SKUs with a company contract price. */
export function pickDefaultVariantSku(
  variants: VariantLike[],
  prices: Record<string, PriceDTO | undefined>,
): string | undefined {
  if (variants.length === 0) return undefined
  const inStock = variants.filter((v) => v.inStock && !v.discontinued)
  const candidates = inStock.length > 0 ? inStock : variants
  const withCompany = candidates.find((v) => prices[v.sku]?.source === 'company')
  return (withCompany ?? candidates[0])?.sku
}
