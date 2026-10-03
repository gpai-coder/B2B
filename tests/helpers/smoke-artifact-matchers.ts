/** Matches e2e smoke run ids: `smoke-${Date.now()}-…` (13-digit epoch ms). */
export const SMOKE_PRODUCT_SLUG = /^smoke-\d{13}-faucet$/
export const SMOKE_VARIANT_SKU = /^smoke-\d{13}-sku$/
export const SMOKE_MEDIA_ALT = /^Spec smoke-\d{13}-sku$/

export function isSmokeSweepProductSlug(slug: string | null | undefined): boolean {
  return typeof slug === 'string' && SMOKE_PRODUCT_SLUG.test(slug)
}

export function isSmokeSweepVariantSku(sku: string | null | undefined): boolean {
  return typeof sku === 'string' && SMOKE_VARIANT_SKU.test(sku)
}

export function isSmokeSweepMediaAlt(alt: string | null | undefined): boolean {
  return typeof alt === 'string' && SMOKE_MEDIA_ALT.test(alt)
}
