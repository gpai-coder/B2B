import { loadCatalogListReadModel } from '@/lib/catalog/read-models'

/** @deprecated Use loadCatalogListReadModel from @/lib/catalog/read-models */
export async function loadCatalogPageData(user: Parameters<typeof loadCatalogListReadModel>[0], companyId: string) {
  const { products, prices } = await loadCatalogListReadModel(user, companyId)
  return { catalogProducts: products, prices }
}
