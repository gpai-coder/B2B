import { loadProductDetailReadModel } from '@/lib/catalog/read-models'

/** @deprecated Use loadProductDetailReadModel from @/lib/catalog/read-models */
export async function loadProductDetailPage(
  user: Parameters<typeof loadProductDetailReadModel>[0],
  companyId: string,
  slug: string,
) {
  const model = await loadProductDetailReadModel(user, companyId, slug)
  if (!model) return null
  return { dto: model.product, prices: model.prices }
}
