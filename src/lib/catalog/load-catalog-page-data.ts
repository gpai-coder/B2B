import { getCommerce } from '@/commerce'
import { mapProductToDTO } from '@/lib/catalog/map-payload'
import type { CatalogProductDTO, PriceDTO } from '@/lib/catalog/types'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { User } from '@/payload-types'

export type CatalogPageData = {
  catalogProducts: CatalogProductDTO[]
  prices: Record<string, PriceDTO>
}

export async function loadCatalogPageData(user: User, companyId: string): Promise<CatalogPageData> {
  const payload = await getAppPayload()
  const productsResult = await payload.find({
    collection: 'products',
    limit: 100,
    depth: 1,
    where: {
      catalogHidden: { equals: false },
    },
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const variantsResult = await payload.find({
    collection: 'product-variants',
    sort: 'id',
    limit: 500,
    depth: 1,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const variantsByProduct = new Map<number, typeof variantsResult.docs>()
  for (const variant of variantsResult.docs) {
    const productId = typeof variant.product === 'object' ? variant.product.id : variant.product
    const list = variantsByProduct.get(productId) ?? []
    list.push(variant)
    variantsByProduct.set(productId, list)
  }

  const catalogProducts = productsResult.docs.map((product) =>
    mapProductToDTO(product, variantsByProduct.get(product.id) ?? []),
  )

  const allSkus = variantsResult.docs.map((v) => v.sku)
  const commerce = await getCommerce({ user })
  const priceRows = await commerce.getPrices(companyId, allSkus)
  const prices: Record<string, PriceDTO> = {}
  for (const row of priceRows) {
    prices[row.sku] = row as PriceDTO
  }

  return { catalogProducts, prices }
}
